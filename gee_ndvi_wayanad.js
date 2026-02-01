// Load district boundaries
var districts = ee.FeatureCollection("FAO/GAUL/2015/level2");


// Filter Wayanad district
var wayanad = districts
  .filter(ee.Filter.eq('ADM2_NAME', 'Wayanad'));
Map.centerObject(wayanad, 9);


// Display boundary (ONLY outline, not filled)
Map.addLayer(wayanad.style({
  color: 'red',
  fillColor: '00000000',
  width: 2
}), {}, 'Wayanad Boundary');


// Load Sentinel-2 Surface Reflectance data
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(wayanad)
  .filterDate('2023-02-01', '2023-03-31')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 5))
  .median()
  .clip(wayanad);


// True Color Composite (RGB)
var tcc = {
  bands: ['B4', 'B3', 'B2'],
  min: 0,
  max: 3000
};

Map.addLayer(s2, tcc, 'True Color Composite');


// False Color Composite (NIR-Red-Green)
var fcc = {
  bands: ['B8', 'B4', 'B3'],
  min: 0,
  max: 3000
};

Map.addLayer(s2, fcc, 'False Color Composite');


// NDVI calculation
var ndvi = s2.normalizedDifference(['B8', 'B4']).rename('NDVI');

Map.addLayer(ndvi, {
  min: 0,
  max: 1,
  palette: ['blue', 'white', 'green']
}, 'NDVI');


// Clip NDVI strictly to Wayanad boundary
var ndvi_clipped = ndvi.clip(wayanad);


// AI-inspired rule-based NDVI classification
var ndviClass = ndvi_clipped.expression(
 "(b('NDVI') < 0.2) ? 1" +
 " : (b('NDVI') < 0.4) ? 2" +
 " : (b('NDVI') < 0.6) ? 3" +
 " : 4"
).rename('NDVI_Class');


// Mask non-AOI pixels
ndviClass = ndviClass.updateMask(ndvi_clipped.mask());


Map.addLayer(ndviClass, {
  min: 1,
  max: 4,
  palette: [
    '#2c7bb6', // Water / Non-vegetation (Blue)
    '#fdae61', // Sparse / Stressed vegetation (Orange)
    '#a6d96a', // Moderate vegetation (Light Green)
    '#1a9850'  // Dense / Healthy vegetation (Dark Green)
  ]
}, 'NDVI Vegetation Classes');


var ndviFiltered = ndviClass.focal_mode({
  radius: 1,
  units: 'pixels'
});

Map.addLayer(ndviFiltered, {
  min: 1,
  max: 4,
  palette: [
    '#2c7bb6',
    '#fdae61',
    '#a6d96a',
    '#1a9850'
  ]
}, 'Filtered NDVI Classes');



// Prepare image with class + pixel area
var areaImage = ee.Image.pixelArea()
  .addBands(ndviFiltered);


// Calculate area statistics class-wise
var areaStats = areaImage.reduceRegion({
  reducer: ee.Reducer.sum().group({
    groupField: 1,      // NDVI_Class band index
    groupName: 'NDVI_Class'
  }),
  geometry: wayanad,
  scale: 10,
  maxPixels: 1e13
});


// Print results
print('Vegetation Class Area (sq. meters):', areaStats);


// Convert sq. meters to sq. km
var classAreas = ee.List(areaStats.get('groups')).map(function(item) {
  item = ee.Dictionary(item);
  return item.set('Area_sq_km',
    ee.Number(item.get('sum')).divide(1e6)
  );
});

print('Vegetation Class Area (sq. km):', classAreas);

//Exporting Map  for preparing Final Map Layout in QGIS
Export.image.toDrive({
  image: ndviFiltered,
  description: 'Wayanad_AI_Based_NDVI_Vegetation_Map',
  region: wayanad,
  scale: 10,
  maxPixels: 1e13
});


