import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { GeoJsonLayer, PathLayer } from "@deck.gl/layers";
import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";
import { SimpleMeshLayer } from "deck.gl";
import { ArcLayer } from "@deck.gl/layers";
import { CubeGeometry } from "@luma.gl/core";
import { TextLayer } from "@deck.gl/layers";

/**
 * Converts a hex string to a RGB or RGBA array
 * @param {string} hex - The 6 or 8 char hex to convert
 * @returns {number[]} - Array of 3 RGB or 4 RGBA numbers
 */
function hex_to_rgba(hex) {
  const rgba = hex.match(/[0-9a-f]{2}/gi).map(x => parseInt(x, 16));
  return rgba.length === 4 ? rgba : rgba.slice(0, 3);
}

export const createHeatmapLayer = (i, layer, GEOGRID) =>
  new HeatmapLayer({
    id: `heatmap-layer-${i}-${layer.id || "module"}`,
    data: layer.data || [],
    getPosition: (d) => [d.coordinates[0], d.coordinates[1], 100],
    getWeight: (d) => d.weight || 1,
    radiusPixels: layer.properties?.radiusPixels || 100,
    intensity: layer.properties?.intensity || 0.5,
    opacity: layer.properties?.opacity ?? 0.85,
    threshold: layer.properties?.threshold || 0.5,
    colorRange: layer.properties?.colorRange || [
      [0, 255, 0, 255],
      [255, 255, 0, 255],
      [255, 0, 0, 255],
      [0, 0, 0, 0],
    ],
    updateTriggers: {
      getWeight: GEOGRID,
    },
  });

export const createGeoJsonLayer = (i, layer, GEOGRID) =>
  new GeoJsonLayer({
    id: `geojson-layer-${i}-${layer.id || "module"}`,
    data: layer.data,
    pickable: true,
    stroked: layer.properties?.stroked ?? true,
    filled: layer.properties?.filled ?? true,
    extruded: layer.properties?.extruded ?? false,
    opacity: layer.properties?.opacity ?? 0.85,
    lineWidthScale: layer.properties?.lineWidthScale ?? 1,
    lineWidthMinPixels: layer.properties?.lineWidthMinPixels ?? 2,

    getLineColor: f => {
      const p = f.properties || {};
      const color =
        p.stroke_color_rgb ||
        p.strokeColor ||
        p.lineColor ||
        p.color_rgb ||
        p.color ||
        layer.properties?.stroke_color_rgb ||
        layer.properties?.color_rgb ||
        layer.properties?.color;

      if (Array.isArray(color)) return color;
      if (typeof color === "string") return hex_to_rgba(color);
      return [0, 0, 0, 255];
    },

    getFillColor: f => {
      const p = f.properties || {};
      const color =
        p.fill_color_rgb ||
        p.fillColor ||
        p.color_rgb ||
        p.color ||
        layer.properties?.fill_color_rgb ||
        layer.properties?.color_rgb ||
        layer.properties?.color;

      if (Array.isArray(color)) return color;
      if (typeof color === "string") return hex_to_rgba(color);
      return [0, 0, 0, 160];
    },

    getRadius: layer.properties?.getRadius ?? 100,
    getLineWidth: layer.properties?.getLineWidth ?? 1,
    getElevation: f =>
      f.properties?.height ||
      f.properties?.elevation ||
      layer.properties?.getElevation ||
      0,

    updateTriggers: {
      getFillColor: GEOGRID,
      getLineColor: GEOGRID,
    },
  });

export const createPathLayer = (i, layer, GEOGRID) =>
  new PathLayer({
    id: `path-layer-${i}-${layer.id || "module"}`,
    data: layer.data || [],

    getPath: d => d.path || d.coordinates,

    getColor: d =>
      d.color ||
      d.getColor ||
      d.strokeColor ||
      d.color_rgb ||
      layer.properties?.color ||
      layer.properties?.color_rgb ||
      [255, 255, 255, 255],

    getWidth: d =>
      d.width ||
      d.line_width ||
      layer.properties?.width ||
      layer.properties?.getWidth ||
      6,

    widthUnits: layer.properties?.widthUnits || "pixels",
    widthScale: layer.properties?.widthScale || 1,
    lineWidthMinPixels: layer.properties?.lineWidthMinPixels || 2,
    lineWidthMaxPixels: layer.properties?.lineWidthMaxPixels || 14,

    opacity: layer.properties?.opacity ?? 0.95,
    rounded: layer.properties?.rounded ?? true,
    pickable: true,

    updateTriggers: {
      getPath: GEOGRID,
      getColor: GEOGRID,
      getWidth: GEOGRID,
    },
  });

export const createTileLayer = (mapStyle) => {
  const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;

  // If there is no Mapbox token in .env, fall back to OpenStreetMap tiles.
  // This avoids a black background during local projection debugging.
  const tileUrl =
    mapboxToken && mapStyle
      ? `https://api.mapbox.com/styles/v1/relnox/${mapStyle}/tiles/256/{z}/{x}/{y}?access_token=${mapboxToken}&attribution=false&logo=false&fresh=true`
      : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

  return new TileLayer({
    id: "base-map-layer",
    data: tileUrl,
    minZoom: 0,
    maxZoom: 21,
    tileSize: 256,

    renderSubLayers: (props) => {
      const {
        bbox: { west, south, east, north },
      } = props.tile;

      return new BitmapLayer(props, {
        data: null,
        image: props.data,
        bounds: [west, south, east, north],
      });
    },
  });
};

export const createMeshLayer = (cityIOdata, GEOGRID, OBJLoader) => {
  const cube = new CubeGeometry({ type: "x,z", xlen: 0, ylen: 0, zlen: 0 });

  const header = GEOGRID.properties.header;

  /*
  replace every GEOGRID.features[x].properties
  with cityIOdata.GEOGRIDDATA[x] to update the
  properties of each grid cell
  */
  for (let i = 0; i < GEOGRID.features?.length; i++) {
    // update GEOGRID features from GEOGRIDDATA on cityio
    GEOGRID.features[i].properties = cityIOdata.GEOGRIDDATA[i];

    // inject id with ES7 copy of the object
    GEOGRID.features[i].properties = {
      ...GEOGRID.features[i].properties,
      id: i,
    };
  }

  const meshLayer = new SimpleMeshLayer({
    id: "grid-layer",
    data: GEOGRID.features,
    loaders: [OBJLoader],
    opacity: 0.85,
    mesh: cube,

    getPosition: (d) => {
      const pntArr = d.geometry.coordinates[0];
      const first = pntArr[1];
      const last = pntArr[pntArr.length - 2];
      const center = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2, -1];
      return center;
    },

    getColor: (d) => d.properties.color,
    getOrientation: (d) => [-180, header.rotation, -90],
    getScale: (d) => [
      GEOGRID.properties.header.cellSize / 2.1,
      1,
      GEOGRID.properties.header.cellSize / 2.1,
    ],

    updateTriggers: {
      getScale: GEOGRID,
    },
  });

  const textLayer = new TextLayer({
    id: "text-layer",
    data: GEOGRID.features,

    getPosition: (d) => {
      const pntArr = d.geometry.coordinates[0];
      const first = pntArr[1];
      const last = pntArr[pntArr.length - 2];
      const center = [
        // center of the grid cell
        (first[0] + last[0]) / 2,
        (first[1] + last[1]) / 2,

        // make text slightly above the mesh
        d.properties.height + 1,
      ];
      return center;
    },

    getText: (d) =>
      d.properties.name?.slice(0, 2) || d.properties.id?.toString().slice(0, 2) || null,

    getSize: 10,

    getColor: (d) =>
      d.properties.color ? d.properties.color.map((c) => 255 - c) : [255, 255, 255],
  });

  return [meshLayer, textLayer];
};

// arc layer
export const createArcLayer = (i, layer, GEOGRID) =>
  new ArcLayer({
    id: `arc-layer-${i}-${layer.id || "module"}`,
    data: layer.data || [],
    getSourcePosition: (d) => d.from.coordinates,
    getTargetPosition: (d) => d.to.coordinates,
    getSourceColor: [255, 0, 0],
    getTargetColor: [0, 255, 0],
    getWidth: layer.properties?.width || 1,
    updateTriggers: {
      getSourceColor: GEOGRID,
    },
  });