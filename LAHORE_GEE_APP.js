// ╔══════════════════════════════════════════════════════════════╗
// ║   LAHORE GREEN COVER CHANGE (2017–2025) — GEE APP v2        ║
// ╚══════════════════════════════════════════════════════════════╝

// ================================================================
// SECTION A: FULL PIPELINE
// ================================================================
var lahore     = ee.FeatureCollection(
                   'projects/mediai-project/assets/Lahore_Boundaries');
var lahoreGeom = lahore.geometry();

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

function addIndices(image) {
  return image.addBands([
    image.normalizedDifference(['SR_B5','SR_B4']).rename('NDVI'),
    image.normalizedDifference(['SR_B6','SR_B5']).rename('NDBI'),
    image.normalizedDifference(['SR_B3','SR_B5']).rename('NDWI'),
    image.normalizedDifference(['SR_B3','SR_B6']).rename('MNDWI'),
    image.expression(
      '((SWIR1+Red)-(NIR+Blue))/((SWIR1+Red)+(NIR+Blue))',
      {SWIR1:image.select('SR_B6'),Red:image.select('SR_B4'),
       NIR:image.select('SR_B5'),Blue:image.select('SR_B2')}
    ).rename('BSI')
  ]);
}

var inputBands = ['SR_B2','SR_B3','SR_B4','SR_B5','SR_B6','SR_B7',
                  'NDVI','NDBI','NDWI','MNDWI','BSI'];

function getComposite(year) {
  var s = ee.Date.fromYMD(year-1,11,1);
  var e = ee.Date.fromYMD(year,4,30);
  var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
             .filterDate(s,e).filterBounds(lahoreGeom)
             .map(maskL8L9).map(addIndices);
  var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
             .filterDate(s,e).filterBounds(lahoreGeom)
             .map(maskL8L9).map(addIndices);
  return l8.merge(l9).median().clip(lahoreGeom)
           .set('year',year)
           .set('system:time_start',ee.Date.fromYMD(year,3,1).millis());
}

var years         = [2017,2018,2019,2020,2021,2022,2023,2024,2025];
var compositeList = years.map(function(y){ return getComposite(y); });
var compositeCol  = ee.ImageCollection(compositeList);

function remapWC5(img) {
  return img.remap([10,20,30,40,50,60,80,90],
                   [ 0, 1, 1, 1, 2, 4, 3, 3])
            .rename('landcover').clip(lahoreGeom);
}
var wc2020   = remapWC5(ee.ImageCollection('ESA/WorldCover/v100').first());
var wc2021   = remapWC5(ee.ImageCollection('ESA/WorldCover/v200').first());
var samp2020 = wc2020.addBands(compositeList[3].select(inputBands))
  .stratifiedSample({numPoints:200,classBand:'landcover',
    region:lahoreGeom,scale:30,seed:42,geometries:true,tileScale:4});
var samp2021 = wc2021.addBands(compositeList[4].select(inputBands))
  .stratifiedSample({numPoints:200,classBand:'landcover',
    region:lahoreGeom,scale:30,seed:84,geometries:true,tileScale:4});

var withRandom = samp2020.merge(samp2021).randomColumn('random',42);
var classifier = ee.Classifier.smileRandomForest({numberOfTrees:150,seed:42})
  .train({features:withRandom.filter(ee.Filter.lt('random',0.7)),
          classProperty:'landcover',inputProperties:inputBands});

function classify5(composite) {
  var rf4  = composite.select(inputBands).classify(classifier);
  var ndvi = composite.select('NDVI');
  var isVB = rf4.eq(1).or(rf4.eq(4));
  return rf4
    .where(isVB.and(ndvi.gt(0.30)),      1)
    .where(isVB.and(ndvi.gt(0.30).not()),4)
    .rename('classification');
}

var classifiedList = years.map(function(y,i){
  return classify5(compositeList[i])
    .set('year',y)
    .set('system:time_start',ee.Date.fromYMD(y,3,1).millis());
});
var classifiedCol = ee.ImageCollection(classifiedList);

// ================================================================
// SECTION B: APP UI
// ================================================================
var BG      = '#1a1a2e';   // dark navy — panel background
var BG2     = '#16213e';   // slightly lighter — card background
var ACCENT  = '#4ecca3';   // teal — headings
var TEXT    = '#e0e0e0';   // light grey — body text
var MUTED   = '#7f8c8d';   // grey — secondary text

var palette    = ['#1a6a1a','#73c94a','#e05c1a','#4169e1','#f5e642'];
var classNames = ['Tree Cover','Greenery / Agriculture',
                  'Built-up Area','Waterbody','Barren'];
var classVis   = {min:0,max:4,palette:palette};

// Helper: styled label (always explicit background to prevent white boxes)
function lbl(text, size, color, bold, bg) {
  return ui.Label({
    value: text,
    style: {
      fontSize:        size  || '12px',
      color:           color || TEXT,
      fontWeight:      bold  ? 'bold' : 'normal',
      backgroundColor: bg   || BG,
      margin:          '3px 0',
      padding:         '0'
    }
  });
}

// ── Clear default UI ────────────────────────────────────────────
ui.root.clear();

// ── Map ─────────────────────────────────────────────────────────
var mapPanel = ui.Map();
mapPanel.setOptions('HYBRID');
mapPanel.setControlVisibility({all:false, zoomControl:true});
mapPanel.centerObject(lahoreGeom, 10);
mapPanel.addLayer(lahore, {color:'FFFFFF'}, 'District Boundary');

// ── Side panel ──────────────────────────────────────────────────
var side = ui.Panel({
  style:{width:'290px', padding:'12px', backgroundColor:BG}
});

// Title row
var titleRow = ui.Panel({
  layout:ui.Panel.Layout.flow('horizontal'),
  style:{backgroundColor:BG, margin:'0 0 2px 0'}
});
titleRow.add(lbl('🌿 ', '22px', '#4ecca3', true, BG));
titleRow.add(lbl('Lahore Green Cover', '20px', '#4ecca3', true, BG));
side.add(titleRow);
side.add(lbl('Vegetation & Land Cover Change (2017–2025)',
             '12px', '#a5d6a7', false, BG));

// ── Year selector card ──────────────────────────────────────────
var yearCard = ui.Panel({
  style:{backgroundColor:BG2, padding:'8px',
         margin:'10px 0 6px 0', border:'1px solid #2d3561'}
});
yearCard.add(lbl('SELECT YEAR', '11px', ACCENT, true, BG2));

// Year row: label + big number
var yearRow = ui.Panel({
  layout:ui.Panel.Layout.flow('horizontal'),
  style:{backgroundColor:BG2, margin:'4px 0'}
});
yearRow.add(lbl('Showing: ', '13px', MUTED, false, BG2));

var yearDisplay = ui.Label({
  value: '2017',
  style:{fontSize:'22px', fontWeight:'bold', color:'#ffffff',
         backgroundColor:BG2, margin:'0 0 0 4px', padding:'0'}
});
yearRow.add(yearDisplay);
yearCard.add(yearRow);

// Slider
var slider = ui.Slider({
  min:2017, max:2025, value:2017, step:1,
  style:{width:'250px', margin:'4px 0 6px 0'}
});
yearCard.add(slider);

// Year quick-buttons
var btnRow = ui.Panel({
  layout:ui.Panel.Layout.flow('horizontal'),
  style:{backgroundColor:BG2, margin:'2px 0 0 0', padding:'0'}
});
years.forEach(function(y){
  var b = ui.Button({
    label: String(y).slice(2),    // show last 2 digits: 17,18,...25
    style:{fontSize:'11px', padding:'2px 4px', margin:'1px',
           backgroundColor:'#2d3561', color:'#b0bec5'}
  });
  b.onClick(function(){ slider.setValue(y); });
  btnRow.add(b);
});
yearCard.add(btnRow);
side.add(yearCard);

// ── Legend card ─────────────────────────────────────────────────
var legendCard = ui.Panel({
  style:{backgroundColor:BG2, padding:'8px',
         margin:'6px 0', border:'1px solid #2d3561'}
});
legendCard.add(lbl('LEGEND', '11px', ACCENT, true, BG2));

classNames.forEach(function(name, i){
  var row = ui.Panel({
    layout:ui.Panel.Layout.flow('horizontal'),
    style:{backgroundColor:BG2, margin:'3px 0', padding:'0'}
  });
  // Coloured swatch box
  row.add(ui.Label({
    value: '',
    style:{backgroundColor:palette[i],
           padding:'6px 14px',
           margin:'1px 8px 1px 0',
           border:'0px solid #000'}
  }));
  row.add(lbl(name, '12px', TEXT, false, BG2));
  legendCard.add(row);
});
side.add(legendCard);

// ── Area chart (dynamic) ────────────────────────────────────────
var areaTitle = lbl('AREA BY CLASS (km²)', '11px', ACCENT, true, BG);
side.add(areaTitle);

var chartPanel = ui.Panel({
  style:{backgroundColor:BG2, padding:'4px',
         border:'1px solid #2d3561', margin:'0 0 6px 0'}
});
side.add(chartPanel);

// ── NDVI trend (static) ─────────────────────────────────────────
side.add(lbl('MEAN NDVI TREND (2017–2025)', '11px', ACCENT, true, BG));
var ndviChart = ui.Chart.image.series({
  imageCollection: compositeCol.select('NDVI'),
  region: lahoreGeom, reducer: ee.Reducer.mean(),
  scale:500, xProperty:'system:time_start'
}).setChartType('LineChart').setOptions({
  title:'',
  backgroundColor: BG2,
  hAxis:{title:'Year', format:'yyyy',
         textStyle:{color:TEXT}, titleTextStyle:{color:MUTED},
         gridlines:{color:'#2d3561'}},
  vAxis:{title:'Mean NDVI',
         textStyle:{color:TEXT}, titleTextStyle:{color:MUTED},
         viewWindow:{min:0.2, max:0.65},
         gridlines:{color:'#2d3561'}},
  colors:['#4ecca3'], lineWidth:2, pointSize:5,
  legend:{position:'none'},
  chartArea:{backgroundColor:BG2, width:'80%', height:'65%'}
});
side.add(ndviChart);

// ── Credits ─────────────────────────────────────────────────────
var credCard = ui.Panel({
  style:{backgroundColor:BG2, padding:'6px',
         margin:'8px 0 0 0', border:'1px solid #2d3561'}
});
credCard.add(lbl('Data: Landsat 8/9 (USGS) · ESA WorldCover',
                 '10px', MUTED, false, BG2));
credCard.add(lbl('Classifier: Random Forest (Breiman 2001)',
                 '10px', MUTED, false, BG2));
credCard.add(lbl('Reference: Gilani & Ahmad (2018)',
                 '10px', MUTED, false, BG2));
credCard.add(lbl('OA: 68.3% · κ: 0.60 | mediai-project · GEE',
                 '10px', '#455a64', false, BG2));
side.add(credCard);

// ── Layout ──────────────────────────────────────────────────────
ui.root.add(ui.SplitPanel({
  firstPanel: side, secondPanel: mapPanel,
  orientation:'horizontal', wipe:false
}));

// ================================================================
// SECTION C: UPDATE FUNCTION
// ================================================================
function updateMap(year) {
  year = Math.round(year);
  yearDisplay.setValue(String(year));

  // Replace LULC layer (keep boundary at index 0)
  var layers = mapPanel.layers();
  while (layers.length() > 1) layers.remove(layers.get(1));

  var idx = years.indexOf(year);
  mapPanel.addLayer(classifiedList[idx], classVis, year + ' LULC');

  // Area bar chart
  var pxKm2 = ee.Image.pixelArea().divide(1e6);
  var areas  = pxKm2.addBands(classifiedList[idx]).reduceRegion({
    reducer:    ee.Reducer.sum().group({groupField:1, groupName:'class'}),
    geometry:   lahoreGeom, scale:500,
    bestEffort: true, maxPixels:1e10
  });

  var areaChart = ui.Chart.feature.byFeature({
    features: ee.FeatureCollection(
      ee.List(ee.Dictionary(areas).get('groups')).map(function(g){
        g = ee.Dictionary(g);
        return ee.Feature(null,{
          class: ee.Number(g.get('class')).int(),
          area:  g.get('sum')
        });
      })
    ),
    xProperty:'class', yProperties:['area']
  }).setChartType('ColumnChart').setOptions({
    title: String(year) + '  —  Area (km²)',
    backgroundColor: BG2,
    titleTextStyle:{color:TEXT, fontSize:11},
    hAxis:{ticks:[{v:0,f:'Tree'},{v:1,f:'Agri'},{v:2,f:'Built'},
                  {v:3,f:'Water'},{v:4,f:'Barren'}],
           textStyle:{color:TEXT,fontSize:10},
           gridlines:{color:'#2d3561'}},
    vAxis:{title:'km²', textStyle:{color:TEXT},
           titleTextStyle:{color:MUTED},
           gridlines:{color:'#2d3561'}},
    colors: palette,
    legend:{position:'none'},
    chartArea:{backgroundColor:BG2, width:'82%', height:'60%'}
  });

  chartPanel.clear();
  chartPanel.add(areaChart);
}

slider.onChange(function(value){ updateMap(value); });
updateMap(2017);
