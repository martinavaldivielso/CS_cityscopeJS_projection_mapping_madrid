import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { GeoJsonLayer, PathLayer } from "@deck.gl/layers";
import { TileLayer, H3ClusterLayer } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";
import { SimpleMeshLayer } from "deck.gl";
import { ArcLayer } from "@deck.gl/layers";
import { CubeGeometry } from "@luma.gl/core";
import { TextLayer } from "@deck.gl/layers";

/**
 * Converts a hex string to a RGB or RGBA array.
 * @param {string} hex - The 6 or 8 char hex to convert.
 * @returns {number[]} - Array of 3 RGB or 4 RGBA numbers.
 */
function hex_to_rgba(hex) {
  const rgba = hex.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16));
  return rgba.length === 4 ? rgba : rgba.slice(0, 3);
}

function featureCenter(feature) {
  const coordinates = feature?.geometry?.coordinates?.[0];
  if (!Array.isArray(coordinates) || coordinates.length < 3) return [0, 0, 0];

  const first = coordinates[1] || coordinates[0];
  const last = coordinates[coordinates.length - 2] || coordinates[coordinates.length - 1];

  return [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2, 20];
}

function safeCellProperties(cell, fallbackId) {
  const source = cell && typeof cell === "object" ? cell : {};
  const color = Array.isArray(source.color) ? source.color : [255, 255, 255];

  return {
    ...source,
    color,
    id: source.id ?? fallbackId,
  };
}

export const createHeatmapLayer = (i, layer, GEOGRID) =>
  new HeatmapLayer({
    id: `heatmap-layer-${i}-${layer.id || "module"}`,
    data: layer.data || [],
    getPosition: (d) => [d.coordinates[0], d.coordinates[1], 100],
    getWeight: (d) => d.weight || 1,
    radiusPixels: layer.properties?.radiusPixels || 10,
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

export const createH3ClusterLayer = (i, layer, GEOGRID) =>
  new H3ClusterLayer({
    id: `h3cluster-layer-${i}-${layer.id || "module"}`,
    data: layer.data || [],

    getHexagons: (d) => d.hexIds || d.hexagons || [],

    getFillColor: (d) =>
      d.color ||
      d.color_rgb ||
      layer.properties?.color ||
      [255, 120, 0, 220],

    getLineColor: (d) =>
      d.lineColor ||
      d.line_color_rgb ||
      layer.properties?.lineColor ||
      [20, 20, 20, 180],

    lineWidthMinPixels: layer.properties?.lineWidthMinPixels || 1,
    opacity: layer.properties?.opacity ?? 0.88,
    stroked: layer.properties?.stroked ?? true,
    filled: layer.properties?.filled ?? true,
    pickable: true,

    parameters: {
      depthTest: false,
    },

    updateTriggers: {
      getHexagons: GEOGRID,
      getFillColor: GEOGRID,
      getLineColor: GEOGRID,
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

    getLineColor: (f) => {
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

    getFillColor: (f) => {
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

    getRadius: layer.properties?.getRadius ?? 10,
    pointType: layer.properties?.pointType || "circle",
    pointRadiusUnits: layer.properties?.pointRadiusUnits || "pixels",
    pointRadiusMinPixels: layer.properties?.pointRadiusMinPixels ?? 2,
    pointRadiusMaxPixels: layer.properties?.pointRadiusMaxPixels ?? 20,
    getPointRadius: f =>
      f.properties?.point_radius ||
      f.properties?.pointRadius ||
      layer.properties?.getPointRadius ||
      layer.properties?.pointRadius ||
      6,
    getLineWidth: layer.properties?.getLineWidth ?? 1,
    getElevation: (f) =>
      f.properties?.height ||
      f.properties?.elevation ||
      layer.properties?.getElevation ||
      0,

    parameters: {
      depthTest: false,
    },

    updateTriggers: {
      getFillColor: GEOGRID,
      getLineColor: GEOGRID,
      getPointRadius: GEOGRID,
    },
  });

export const createPathLayer = (i, layer, GEOGRID) =>
  new PathLayer({
    id: `path-layer-${i}-${layer.id || "module"}`,
    data: layer.data || [],

    getPath: (d) => d.path || d.coordinates,

    getColor: (d) =>
      d.color ||
      d.getColor ||
      d.strokeColor ||
      d.color_rgb ||
      layer.properties?.color ||
      layer.properties?.color_rgb ||
      [255, 255, 255, 255],

    getWidth: (d) =>
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

    parameters: {
      depthTest: false,
    },

    updateTriggers: {
      getPath: GEOGRID,
      getColor: GEOGRID,
      getWidth: GEOGRID,
    },
  });

export const createTileLayer = (mapStyle) => {
  const tileUrl = "https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png";

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
  const cube = new CubeGeometry({ type: "x,z", xlen: 1, ylen: 1, zlen: 1 });
  const header = GEOGRID.properties.header;
  const geogridData = Array.isArray(cityIOdata.GEOGRIDDATA) ? cityIOdata.GEOGRIDDATA : [];
  const features = (GEOGRID.features || []).map((feature, index) => ({
    ...feature,
    properties: safeCellProperties(geogridData[index] || feature.properties, index),
  }));

  const meshLayer = new SimpleMeshLayer({
    id: "grid-layer",
    data: features,
    loaders: [OBJLoader],
    opacity: 1,
    mesh: cube,

    parameters: {
      depthTest: false,
    },

    getPosition: (d) => featureCenter(d),

    getColor: (d) => {
      const color = Array.isArray(d.properties?.color) ? d.properties.color : [255, 255, 255];
      return [color[0], color[1], color[2], 255];
    },

    getOrientation: () => [-180, header.rotation || 0, -90],

    getScale: () => [
      GEOGRID.properties.header.cellSize / 2.1,
      1,
      GEOGRID.properties.header.cellSize / 2.1,
    ],

    updateTriggers: {
      getScale: geogridData,
      getColor: geogridData,
    },
  });

  const textLayer = new TextLayer({
    id: "text-layer",
    data: features,

    parameters: {
      depthTest: false,
    },

    getPosition: (d) => {
      const [x, y] = featureCenter(d);
      return [x, y, 30];
    },

    getText: (d) =>
      d.properties?.name?.slice(0, 2) ||
      d.properties?.type?.toString().slice(0, 2) ||
      d.properties?.id?.toString().slice(0, 2) ||
      "",

    getSize: 10,

    getColor: (d) => {
      const color = Array.isArray(d.properties?.color) ? d.properties.color : [255, 255, 255];
      return [255 - color[0], 255 - color[1], 255 - color[2], 255];
    },

    updateTriggers: {
      getText: geogridData,
      getColor: geogridData,
    },
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

    parameters: {
      depthTest: false,
    },

    updateTriggers: {
      getSourceColor: GEOGRID,
    },
  });
