import { HeatmapLayer } from "@deck.gl/aggregation-layers";

import {
  GeoJsonLayer,
  PathLayer,
  BitmapLayer,
  ArcLayer,
} from "@deck.gl/layers";

import {
  TileLayer,
  H3ClusterLayer,
} from "@deck.gl/geo-layers";


/* =========================================================
   CARTO BASEMAP
   ========================================================= */

const DEFAULT_DARK_CARTO_TILE_URL =
  "https://basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png?key=cb1_3ogj_1_5edcf0d897bd93afc2831076";


/* =========================================================
   MAPBOX TOKEN HANDLING
   ========================================================= */

function withMapboxTokenIfNeeded(tileUrl) {
  if (!tileUrl) return tileUrl;

  const isMapboxUrl =
    /(^mapbox:\/\/)|(^https?:\/\/[^/]*mapbox\.com\/)/i.test(
      tileUrl
    );

  if (!isMapboxUrl) return tileUrl;

  const token =
    process.env.REACT_APP_MAPBOX_TOKEN;

  if (
    !token ||
    /[?&]access_token=/i.test(tileUrl)
  ) {
    return tileUrl;
  }

  const joiner =
    tileUrl.includes("?") ? "&" : "?";

  return `${tileUrl}${joiner}access_token=${encodeURIComponent(
    token
  )}`;
}


/* =========================================================
   TILE URL RESOLUTION
   ========================================================= */

function resolveTileUrl() {
  const configuredTileUrl =
    (
      process.env.REACT_APP_BASEMAP_TILE_URL ||
      ""
    ).trim();

  /*
   * No custom basemap configured:
   * use CARTO dark_nolabels with API key.
   */

  if (!configuredTileUrl) {
    return DEFAULT_DARK_CARTO_TILE_URL;
  }

  /*
   * If a custom Mapbox URL is configured,
   * add the Mapbox token if available.
   */

  const withToken =
    withMapboxTokenIfNeeded(
      configuredTileUrl
    );

  const isMapboxUrl =
    /(^mapbox:\/\/)|(^https?:\/\/[^/]*mapbox\.com\/)/i.test(
      withToken
    );

  const hasToken =
    /[?&]access_token=/i.test(
      withToken
    );

  /*
   * If Mapbox was configured but there
   * is no token, fall back to CARTO.
   */

  if (
    isMapboxUrl &&
    !hasToken
  ) {
    console.warn(
      "Configured Mapbox basemap URL has no access token; falling back to dark CARTO tiles."
    );

    return DEFAULT_DARK_CARTO_TILE_URL;
  }

  return withToken;
}


/* =========================================================
   COLOR UTILITIES
   ========================================================= */

/**
 * Converts a hex string to an RGB or RGBA array.
 *
 * @param {string} hex
 * @returns {number[]}
 */

function hex_to_rgba(hex) {
  const matches =
    hex.match(/[0-9a-f]{2}/gi);

  if (!matches) {
    return [255, 255, 255];
  }

  const rgba =
    matches.map((x) =>
      parseInt(x, 16)
    );

  return rgba.length === 4
    ? rgba
    : rgba.slice(0, 3);
}


/* =========================================================
   SAFE CELL PROPERTIES
   ========================================================= */

function safeCellProperties(
  cell,
  fallbackId
) {
  const source =
    cell &&
    typeof cell === "object"
      ? cell
      : {};

  const color =
    Array.isArray(source.color)
      ? source.color
      : [255, 255, 255];

  return {
    ...source,

    color,

    id:
      source.id ??
      fallbackId,
  };
}


/* =========================================================
   HEATMAP LAYER
   ========================================================= */

export const createHeatmapLayer = (
  i,
  layer,
  GEOGRID
) =>
  new HeatmapLayer({
    id: `heatmap-layer-${i}-${
      layer.id || "module"
    }`,

    data:
      layer.data || [],

    getPosition: (d) => [
      d.coordinates[0],
      d.coordinates[1],
      100,
    ],

    getWeight: (d) =>
      d.weight || 1,

    radiusPixels:
      layer.properties
        ?.radiusPixels ||
      10,

    intensity:
      layer.properties
        ?.intensity ||
      0.5,

    opacity:
      layer.properties
        ?.opacity ??
      0.85,

    threshold:
      layer.properties
        ?.threshold ||
      0.5,

    colorRange:
      layer.properties
        ?.colorRange || [
        [0, 255, 0, 255],
        [255, 255, 0, 255],
        [255, 0, 0, 255],
        [0, 0, 0, 0],
      ],

    updateTriggers: {
      getWeight: GEOGRID,
    },
  });


/* =========================================================
   H3 CLUSTER LAYER
   ========================================================= */

export const createH3ClusterLayer = (
  i,
  layer,
  GEOGRID
) =>
  new H3ClusterLayer({
    id: `h3cluster-layer-${i}-${
      layer.id || "module"
    }`,

    data:
      layer.data || [],

    getHexagons: (d) =>
      d.hexIds ||
      d.hexagons ||
      [],

    getFillColor: (d) =>
      d.color ||
      d.color_rgb ||
      layer.properties
        ?.color ||
      [255, 120, 0, 220],

    getLineColor: (d) =>
      d.lineColor ||
      d.line_color_rgb ||
      layer.properties
        ?.lineColor ||
      [20, 20, 20, 180],

    lineWidthMinPixels:
      layer.properties
        ?.lineWidthMinPixels ||
      1,

    opacity:
      layer.properties
        ?.opacity ??
      0.88,

    stroked:
      layer.properties
        ?.stroked ??
      true,

    filled:
      layer.properties
        ?.filled ??
      true,

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


/* =========================================================
   GEOJSON LAYER
   ========================================================= */

export const createGeoJsonLayer = (
  i,
  layer,
  GEOGRID
) =>
  new GeoJsonLayer({
    id: `geojson-layer-${i}-${
      layer.id || "module"
    }`,

    data:
      layer.data,

    pickable: true,

    stroked:
      layer.properties
        ?.stroked ??
      true,

    filled:
      layer.properties
        ?.filled ??
      true,

    extruded:
      layer.properties
        ?.extruded ??
      false,

    opacity:
      layer.properties
        ?.opacity ??
      0.85,

    lineWidthScale:
      layer.properties
        ?.lineWidthScale ??
      1,

    lineWidthMinPixels:
      layer.properties
        ?.lineWidthMinPixels ??
      2,

    getLineColor: (f) => {
      const p =
        f.properties || {};

      const color =
        p.stroke_color_rgb ||
        p.strokeColor ||
        p.lineColor ||
        p.color_rgb ||
        p.color ||
        layer.properties
          ?.stroke_color_rgb ||
        layer.properties
          ?.color_rgb ||
        layer.properties
          ?.color;

      if (Array.isArray(color)) {
        return color;
      }

      if (
        typeof color ===
        "string"
      ) {
        return hex_to_rgba(
          color
        );
      }

      return [
        0,
        0,
        0,
        255,
      ];
    },

    getFillColor: (f) => {
      const p =
        f.properties || {};

      const color =
        p.fill_color_rgb ||
        p.fillColor ||
        p.color_rgb ||
        p.color ||
        layer.properties
          ?.fill_color_rgb ||
        layer.properties
          ?.color_rgb ||
        layer.properties
          ?.color;

      if (Array.isArray(color)) {
        return color;
      }

      if (typeof color === "string") {
        return hex_to_rgba(color);
      }

      return [
        0,
        0,
        0,
        160,
      ];
    },

    getRadius:
      layer.properties
        ?.getRadius ??
      10,

    pointType:
      layer.properties
        ?.pointType ||
      "circle",

    pointRadiusUnits:
      layer.properties
        ?.pointRadiusUnits ||
      "pixels",

    pointRadiusMinPixels:
      layer.properties
        ?.pointRadiusMinPixels ??
      2,

    pointRadiusMaxPixels:
      layer.properties
        ?.pointRadiusMaxPixels ??
      20,

    getPointRadius: (f) =>
      f.properties
        ?.point_radius ||
      f.properties
        ?.pointRadius ||
      layer.properties
        ?.getPointRadius ||
      layer.properties
        ?.pointRadius ||
      6,

    getLineWidth:
      layer.properties
        ?.getLineWidth ??
      1,

    getElevation: (f) =>
      f.properties?.height ||
      f.properties
        ?.elevation ||
      layer.properties
        ?.getElevation ||
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


/* =========================================================
   PATH LAYER
   ========================================================= */

export const createPathLayer = (
  i,
  layer,
  GEOGRID
) =>
  new PathLayer({
    id: `path-layer-${i}-${
      layer.id || "module"
    }`,

    data:
      layer.data || [],

    getPath: (d) =>
      d.path ||
      d.coordinates,

    getColor: (d) =>
      d.color ||
      d.getColor ||
      d.strokeColor ||
      d.color_rgb ||
      layer.properties
        ?.color ||
      layer.properties
        ?.color_rgb ||
      [
        255,
        255,
        255,
        255,
      ],

    getWidth: (d) =>
      d.width ??
      d.line_width ??
      layer.properties
        ?.width ??
      layer.properties
        ?.getWidth ??
      6,

    widthUnits:
      layer.properties
        ?.widthUnits ||
      "pixels",

    widthScale:
      layer.properties
        ?.widthScale ??
      1,

    widthMinPixels:
      layer.properties
        ?.widthMinPixels ??
      layer.properties
        ?.lineWidthMinPixels ??
      2,

    widthMaxPixels:
      layer.properties
        ?.widthMaxPixels ??
      layer.properties
        ?.lineWidthMaxPixels ??
      32,

    opacity:
      layer.properties
        ?.opacity ??
      0.95,

    capRounded:
      layer.properties
        ?.capRounded ??
      true,

    jointRounded:
      layer.properties
        ?.jointRounded ??
      true,

    billboard: true,

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


/* =========================================================
   CARTO / BASEMAP TILE LAYER
   ========================================================= */

export const createTileLayer = () => {
  const tileUrl =
    resolveTileUrl();

  return new TileLayer({
    id: "base-map-layer",

    data:
      tileUrl,

    minZoom: 0,

    maxZoom: 21,

    tileSize: 256,

    renderSubLayers: (
      props
    ) => {
      const {
        bbox: {
          west,
          south,
          east,
          north,
        },
      } = props.tile;

      return new BitmapLayer(
        props,
        {
          id: `${props.id}-bitmap`,

          data: null,

          image:
            props.data,

          bounds: [
            west,
            south,
            east,
            north,
          ],
        }
      );
    },
  });
};


/* =========================================================
   CITYSCOPE / GEOGRID MESH
   ========================================================= */

export const createMeshLayer = (
  cityIOdata,
  GEOGRID
) => {
  const geogridData =
    Array.isArray(
      cityIOdata.GEOGRIDDATA
    )
      ? cityIOdata.GEOGRIDDATA
      : [];

  const features =
    (
      GEOGRID.features ||
      []
    ).map(
      (
        feature,
        index
      ) => ({
        ...feature,

        properties:
          safeCellProperties(
            geogridData[
              index
            ] ||
              feature.properties,

            index
          ),
      })
    );

  return new GeoJsonLayer({
    id: "grid-layer",

    data: {
      type:
        "FeatureCollection",

      features,
    },

    pickable: false,

    stroked: true,

    filled: true,

    extruded: false,

    opacity: 1,

    lineWidthMinPixels: 1,

    parameters: {
      depthTest: false,
    },

    getFillColor: (
      feature
    ) => {
      const color =
        Array.isArray(
          feature.properties
            ?.color
        )
          ? feature
              .properties
              .color
          : [
              255,
              255,
              255,
            ];

      return [
        color[0],
        color[1],
        color[2],
        255,
      ];
    },

    getLineColor: [
      0,
      0,
      0,
      170,
    ],

    updateTriggers: {
      getFillColor:
        geogridData,
    },
  });
};


/* =========================================================
   ARC LAYER
   ========================================================= */

export const createArcLayer = (
  i,
  layer,
  GEOGRID
) =>
  new ArcLayer({
    id: `arc-layer-${i}-${
      layer.id || "module"
    }`,

    data:
      layer.data || [],

    getSourcePosition: (
      d
    ) =>
      d.from.coordinates,

    getTargetPosition: (
      d
    ) =>
      d.to.coordinates,

    getSourceColor: [
      255,
      0,
      0,
    ],

    getTargetColor: [
      0,
      255,
      0,
    ],

    getWidth:
      layer.properties
        ?.width ||
      1,

    parameters: {
      depthTest: false,
    },

    updateTriggers: {
      getSourceColor:
        GEOGRID,
    },
  });
