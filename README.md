# 🌿 Lahore Green Cover Change Analysis (2017–2025)

A year-wise vegetation and land cover change analysis for **Lahore District, Pakistan** using Google Earth Engine (GEE), Landsat 8/9 satellite imagery, and Random Forest machine learning classification.

This study extends the methodology of **Gilani & Ahmad (2018)** — *"Lahore is losing its green cover — fast"* — from the 1990–2017 period to 2017–2025.

---

## 🔗 Live GEE App

**[Launch Interactive App →](https://mediai-project.projects.earthengine.app/view/lahore-green-cover-2017-2025)**

Features:
- Year slider (2017 → 2025)
- 5-class land cover map
- Area statistics chart per year
- Mean NDVI trend chart (2017–2025)

---

## 📊 Land Cover Classes

| Class | Label | Colour |
|-------|-------|--------|
| 0 | Tree Cover | 🟢 Dark Green |
| 1 | Greenery / Agriculture | 🟩 Light Green |
| 2 | Built-up Area | 🟠 Orange |
| 3 | Waterbody | 🔵 Blue |
| 4 | Barren | 🟡 Yellow |

---

## 🛰️ Data & Methodology

| Component | Detail |
|-----------|--------|
| Satellites | Landsat 8 OLI-TIRS + Landsat 9 OLI-2 |
| Collection | USGS Collection 2 Tier-1 Level-2 Surface Reflectance |
| Resolution | 30 m spatial, 16-day revisit |
| Season | Winter median composite (Nov–Apr) — avoids monsoon cloud cover |
| Period | 2017–2025 (9 annual composites) |
| Features | SR_B2–B7 + NDVI + NDBI + NDWI + MNDWI + BSI (11 features) |
| Classifier | Random Forest (n=150 trees, seed=42) |
| Training data | ESA WorldCover v100 (2020) + v200 (2021) — stratified random sampling |
| Post-processing | NDVI threshold (0.30) to separate Greenery/Agri from Barren |
| Boundary | geoBoundaries Pakistan Level-2 (Lahore District) |
| Platform | Google Earth Engine (Gorelick et al. 2017) |

**Accuracy Assessment:**
- Overall Accuracy (OA): **68.3%**
- Kappa Coefficient (κ): **0.60**
- Note: Seasonal mismatch between winter Landsat composites and WorldCover annual product is the primary source of error, particularly between Agriculture and Barren classes.

---

## 📁 Repository Structure

```
lahore-green-cover-2017-2025/
│
├── LAHORE_LULC_FINAL.js      # Full classification pipeline (GEE script)
├── LAHORE_GEE_APP.js         # Interactive GEE App script
├── thumbnail_gee.png          # App thumbnail
└── README.md                  # This file
```

---

## 🚀 How to Run

1. Open [Google Earth Engine Code Editor](https://code.earthengine.google.com)
2. Copy the contents of `LAHORE_LULC_FINAL.js`
3. Paste into a new GEE script
4. Upload `Lahore_Boundaries` shapefile as a GEE asset (see note below)
5. Update the asset path on line 4 to match your GEE username
6. Click **Run**

> **Asset requirement:** You need to upload the Lahore District boundary shapefile as a GEE asset. Download from [geoBoundaries](https://www.geoboundaries.org) → Pakistan → Level 2 → filter Lahore.

---

## 📈 Key Findings

| Year | Built-up Fraction |
|------|-----------------|
| 2017 | ~30% |
| 2019 | ~26% |
| 2021 | ~29% |
| 2023 | ~32% |
| 2025 | ~35% |

Mean NDVI declined from **0.393 (2017)** to **0.346 (2025)**, consistent with ongoing urban expansion and green cover loss documented by Gilani & Ahmad (2018).

---

## 📚 References

- Gilani, H. & Ahmad, A. (2018). *Lahore is losing its green cover – fast.* Technology Review PK.
- Zanaga, D. et al. (2022). *ESA WorldCover 10m 2021 v200.* Zenodo. https://doi.org/10.5281/zenodo.7254221
- Breiman, L. (2001). *Random Forests.* Machine Learning, 45(1), 5–32.
- Gorelick, N. et al. (2017). *Google Earth Engine: Planetary-scale geospatial analysis for everyone.* Remote Sensing of Environment, 202, 18–27.
- McFeeters, S.K. (1996). *The use of the NDWI in the delineation of open water features.* International Journal of Remote Sensing, 17(7), 1425–1432.
- Xu, H. (2006). *Modification of NDWI to enhance open water features in remotely sensed imagery.* International Journal of Remote Sensing, 27(14), 3025–3033.

---

## 👤 Author

**Aqeel Raheelshaukat**  
GIS & Remote Sensing Researcher  
GEE Cloud Project: `mediai-project`

---

## 📄 License

MIT License — free to use, modify, and distribute with attribution.
