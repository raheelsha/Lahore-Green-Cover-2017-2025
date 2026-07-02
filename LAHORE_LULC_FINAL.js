// ╔══════════════════════════════════════════════════════════════╗
// ║   LAHORE GREEN COVER CHANGE ANALYSIS (2017–2025)            ║
// ║   5-Class RF + NDVI Post-Processing                         ║
// ║   Reference: Gilani & Ahmad (2018) — extended to 2025       ║
// ║   Training: ESA WorldCover v100+v200 (Zanaga et al. 2022)   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// CLASSES (matching Gilani & Ahmad 2018):
//   0 = Tree cover          dark green
//   1 = Greenery/Agri       light green
//   2 = Built-up            orange
//   3 = Waterbody           blue
//   4 = Barren              yellow
//
// METHODOLOGY:
//   Stage 1 — RF classifies 5 classes using WorldCover-derived samples.
//              WorldCover class 60 (bare/sparse) kept as class 4 (Barren).
//              WorldCover class 40 (cropland) = class 1 (Agri).
//   Stage 2 — NDVI post-processing (threshold 0.30) resolves seasonal
//              confusion: winter-harvested Agri pixels (low NDVI) that RF
//              mislabels as Agri are reclassified to Barren.
//   This two-stage hybrid is standard for winter LULC mapping in South Asia.

// ================================================================
// 1. STUDY AREA
// ================================================================
var lahore     = ee.FeatureCollection(
                   'projects/mediai-project/assets/Lahore_Boundaries');
var lahoreGeom = lahore.geometry();
Map.centerObject(lahoreGeom, 10);
Map.addLayer(lahore, {color:'FF0000'}, 'Lahore Boundary', true);
print('Boundary features (expect 1):', lahore.size());

// ================================================================
// 2. CLOUD MASK + SURFACE REFLECTANCE SCALING
// ================================================================
function maskL8L9(image) {
  var qa   = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(1<<1).eq(0)
               .and(qa.bitwiseAnd(1<<3).eq(0))
               .and(qa.bitwiseAnd(1<<4).eq(0));
  return image.select('SR_B.')
              .multiply(0.0000275).add(-0.2)
              .updateMask(mask)
              .copyProperties(image, ['system:time_start']);
}

// ================================================================
// 3. SPECTRAL INDICES (11 features)
// ================================================================
function addIndices(image) {
  var ndvi  = image.normalizedDifference(['SR_B5','SR_B4']).rename('NDVI');
  var ndbi  = image.normalizedDifference(['SR_B6','SR_B5']).rename('NDBI');
  var ndwi  = image.normalizedDifference(['SR_B3','SR_B5']).rename('NDWI');
  var mndwi = image.normalizedDifference(['SR_B3','SR_B6']).rename('MNDWI');
  var bsi   = image.expression(
    '((SWIR1+Red)-(NIR+Blue))/((SWIR1+Red)+(NIR+Blue))',
    {SWIR1:image.select('SR_B6'), Red:image.select('SR_B4'),
     NIR:image.select('SR_B5'),   Blue:image.select('SR_B2')}
  ).rename('BSI');
  return image.addBands([ndvi, ndbi, ndwi, mndwi, bsi]);
}

var inputBands = ['SR_B2','SR_B3','SR_B4','SR_B5','SR_B6','SR_B7',
                  'NDVI','NDBI','NDWI','MNDWI','BSI'];

// ================================================================
// 4. ANNUAL COMPOSITE BUILDER
// ================================================================
function getComposite(year) {
  var s  = ee.Date.fromYMD(year-1, 11, 1);
  var e  = ee.Date.fromYMD(year,    4, 30);
  var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
             .filterDate(s,e).filterBounds(lahoreGeom)
             .map(maskL8L9).map(addIndices);
  var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
             .filterDate(s,e).filterBounds(lahoreGeom)
             .map(maskL8L9).map(addIndices);
  return l8.merge(l9).median().clip(lahoreGeom)
           .set('year', year)
           .set('system:time_start', ee.Date.fromYMD(year,3,1).millis());
}

var years         = [2017,2018,2019,2020,2021,2022,2023,2024,2025];
var compositeList = years.map(function(y){ return getComposite(y); });
var compositeCol  = ee.ImageCollection(compositeList);
print('Composites built:', compositeCol.size());

// ================================================================
// 5. VISUALIZATION
// ================================================================
var visTC    = {bands:['SR_B4','SR_B3','SR_B2'], min:0.02, max:0.25};
var visFCC   = {bands:['SR_B5','SR_B4','SR_B3'], min:0.02, max:0.35};
var classVis = {min:0, max:4,
  palette:['#1a6a1a',  // 0 Tree cover   — dark green
           '#73c94a',  // 1 Greenery/Agri — light green
           '#e05c1a',  // 2 Built-up      — orange
           '#4169e1',  // 3 Waterbody     — blue
           '#f5e642'   // 4 Barren        — yellow
  ]};

Map.addLayer(compositeList[4], visFCC, '2021 False Color',  false);
Map.addLayer(compositeList[0], visTC,  '2017 True Color',   false);
Map.addLayer(compositeList[8], visTC,  '2025 True Color',   false);

// ================================================================
// 6. WORLDCOVER TRAINING — 5-CLASS SCHEME
// ================================================================
// WorldCover → 5-class remapping:
//   10 Tree cover     → 0  (Tree cover)
//   20 Shrubland      → 1  (Greenery — sparse scrub = agri-adjacent)
//   30 Grassland      → 1  (Greenery)
//   40 Cropland       → 1  (Greenery/Agri — main agricultural class)
//   50 Built-up       → 2  (Built-up)
//   60 Bare/sparse    → 4  (Barren ← kept SEPARATE, not merged with agri)
//   80 Water body     → 3  (Waterbody)
//   90 Herb. wetland  → 3  (Waterbody)
//
// KEY CHANGE vs previous: class 60 → 4 (Barren) kept separate.
// This gives the RF a genuine spectral signature for barren land
// based on confirmed bare/sparse pixels from WorldCover.

function remapWC5(img) {
  return img.remap(
    [10, 20, 30, 40, 50, 60, 80, 90],
    [ 0,  1,  1,  1,  2,  4,  3,  3]
  ).rename('landcover').clip(lahoreGeom);
}

var wc2020 = remapWC5(ee.ImageCollection('ESA/WorldCover/v100').first());
var wc2021 = remapWC5(ee.ImageCollection('ESA/WorldCover/v200').first());

// Show WorldCover reference for visual comparison
Map.addLayer(wc2021, classVis, 'WorldCover 2021 (5-class reference)', false);

// 200 pts per class per version → up to 2000 total
var samp2020 = wc2020
  .addBands(compositeList[3].select(inputBands))
  .stratifiedSample({numPoints:200, classBand:'landcover',
    region:lahoreGeom, scale:30, seed:42, geometries:true, tileScale:4});

var samp2021 = wc2021
  .addBands(compositeList[4].select(inputBands))
  .stratifiedSample({numPoints:200, classBand:'landcover',
    region:lahoreGeom, scale:30, seed:84, geometries:true, tileScale:4});

var allSamples = samp2020.merge(samp2021);
print('Total training samples:', allSamples.size());

// ================================================================
// 7. RANDOM FOREST — STAGE 1 (5-class)
// ================================================================
var withRandom = allSamples.randomColumn('random', 42);
var trainSet   = withRandom.filter(ee.Filter.lt('random',  0.7));
var testSet    = withRandom.filter(ee.Filter.gte('random', 0.7));

var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees: 150,
  seed:          42
}).train({
  features:        trainSet,
  classProperty:  'landcover',
  inputProperties: inputBands
});

var validated  = testSet.classify(classifier);
var confMatrix = validated.errorMatrix('landcover','classification');

print('══════════════════════════════════════');
print('STAGE 1 — RF ACCURACY (5-class)');
print('Order: Tree(0) | Agri(1) | Built(2) | Water(3) | Barren(4)');
print('Overall Accuracy:', confMatrix.accuracy());
print('Kappa Coefficient:', confMatrix.kappa());
print('Confusion Matrix:');
print(confMatrix.array());
print('Consumer Accuracy (Precision):', confMatrix.consumersAccuracy());
print('Producer Accuracy (Recall):', confMatrix.producersAccuracy());
print('Feature Importance:', classifier.explain().get('importance'));
print('══════════════════════════════════════');

// ================================================================
// 8. STAGE 2 — NDVI POST-PROCESSING
// ================================================================
// Problem: Harvested cropland in winter (low NDVI) gets labelled
// as Agri (class 1) by RF (trained on WorldCover annual labels).
// Fix: Pixels RF calls Agri(1) OR Barren(4) are re-decided by NDVI:
//   NDVI > 0.30  → class 1 (Greenery/Agriculture — actively growing)
//   NDVI ≤ 0.30  → class 4 (Barren — bare/harvested/fallow)
//
// Threshold 0.30 chosen because:
//   Lahore district mean winter NDVI = 0.35–0.44 (from our chart)
//   Active wheat (Rabi): NDVI 0.35–0.55
//   Fallow/harvested: NDVI 0.05–0.25
//   Mixed/transitional: NDVI 0.25–0.35
// Setting threshold at 0.30 captures the transitional zone correctly.

var NDVI_THRESHOLD = 0.30;

function applyStage2(classified5, composite) {
  var ndvi = composite.select('NDVI');

  // Pixels that RF classified as Agri(1) or Barren(4) — re-decide with NDVI
  var isVegOrBarren = classified5.eq(1).or(classified5.eq(4));
  var isGreen       = ndvi.gt(NDVI_THRESHOLD);

  var final = classified5
    .where(isVegOrBarren.and(isGreen),       1)  // high NDVI → Greenery/Agri
    .where(isVegOrBarren.and(isGreen.not()), 4)  // low NDVI  → Barren
    .rename('classification');

  return final;
}

// ================================================================
// 9. CLASSIFY ALL 9 YEARS
// ================================================================
var classifiedList = years.map(function(y, i) {
  var rf5   = compositeList[i].select(inputBands).classify(classifier);
  var final = applyStage2(rf5, compositeList[i])
                .set('year', y)
                .set('system:time_start', ee.Date.fromYMD(y,3,1).millis());
  Map.addLayer(final, classVis, y + ' LULC', (y===2017||y===2025));
  return final;
});

var classifiedCol = ee.ImageCollection(classifiedList);

// ================================================================
// 10. CLASS FRACTION CHECK (2021 — verify all 5 classes present)
// ================================================================
print('── 2021 class fractions (all 5 should be > 0) ──');
var check2021 = classifiedList[4];
[0,1,2,3,4].forEach(function(c) {
  var frac = check2021.eq(c).reduceRegion({
    reducer:ee.Reducer.mean(), geometry:lahoreGeom,
    scale:500, bestEffort:true
  });
  print('Class ' + c + ' fraction:', frac);
});

// ================================================================
// 11. AREA STATISTICS (km² per class per year)
// ================================================================
print('══ AREA STATISTICS (km²) ══');
var pixelAreaKm2 = ee.Image.pixelArea().divide(1e6);

years.forEach(function(y, i) {
  var areas = pixelAreaKm2.addBands(classifiedList[i]).reduceRegion({
    reducer:    ee.Reducer.sum().group({groupField:1, groupName:'class'}),
    geometry:   lahoreGeom,
    scale:      500,
    bestEffort: true,
    maxPixels:  1e10
  });
  print('Year ' + y + ':', areas);
});

// ================================================================
// 12. NDVI TREND CHART
// ================================================================
print(ui.Chart.image.series({
  imageCollection: compositeCol.select('NDVI'),
  region:lahoreGeom, reducer:ee.Reducer.mean(),
  scale:500, xProperty:'system:time_start'
}).setChartType('LineChart').setOptions({
  title:'Mean NDVI — Lahore District (2017–2025)',
  hAxis:{title:'Year',format:'yyyy'},
  vAxis:{title:'Mean NDVI', viewWindow:{min:0.2,max:0.65}},
  colors:['#27ae60'], lineWidth:2, pointSize:5
}));

// ================================================================
// 13. BUILT-UP AREA TREND CHART
// ================================================================
print(ui.Chart.image.series({
  imageCollection: classifiedCol.map(function(img){
    return img.eq(2).rename('builtup')
              .set('system:time_start',img.get('system:time_start'));
  }),
  region:lahoreGeom, reducer:ee.Reducer.mean(),
  scale:500, xProperty:'system:time_start'
}).setChartType('LineChart').setOptions({
  title:'Built-up Area Fraction — Lahore (2017–2025)',
  hAxis:{title:'Year',format:'yyyy'},
  vAxis:{title:'Fraction — built-up'},
  colors:['#e05c1a'], lineWidth:2, pointSize:5
}));

// ================================================================
// 14. GREEN COVER TREND (Tree + Agri combined)
// ================================================================
print(ui.Chart.image.series({
  imageCollection: classifiedCol.map(function(img){
    return img.eq(0).or(img.eq(1)).rename('green')
              .set('system:time_start',img.get('system:time_start'));
  }),
  region:lahoreGeom, reducer:ee.Reducer.mean(),
  scale:500, xProperty:'system:time_start'
}).setChartType('LineChart').setOptions({
  title:'Green Cover Fraction — Lahore (2017–2025)',
  hAxis:{title:'Year',format:'yyyy'},
  vAxis:{title:'Fraction — green (tree + agri)'},
  colors:['#1a6a1a'], lineWidth:2, pointSize:5
}));

// ================================================================
// EXPECTED OUTPUT:
//   Stage 1 OA: ~0.70–0.82
//   Kappa: ~0.62–0.78
//   Class fractions: all 5 > 0 (barren now visible as yellow)
//   3 trend charts: NDVI / Built-up / Green cover
//   9-year LULC maps on the map panel
//
// SAVE THIS SCRIPT AS: Lahore_LULC_2017_2025_FINAL
// NEXT: Module 4 — GEE App (year slider + legend + charts)
// ================================================================
