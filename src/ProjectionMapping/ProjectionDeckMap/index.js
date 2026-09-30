/*

ProjectionDeckMap

Metric selection is driven by the interactive table slider codes:
UH, AN, A, RA, PTA.

Layer drawing order:
1. basemap
2. selected metric layer(s)
3. interactive grid mesh + labels (always projected on top)

*/

import DeckMap from "./BaseMap";
import {
  createHeatmapLayer,
  createMeshLayer,
  createTileLayer,
  createArcLayer,
  createGeoJsonLayer,
  createPathLayer,
  createH3ClusterLayer,
} from "./layers";
import { useState, useEffect } from "react";
import { OBJLoader } from "@loaders.gl/obj";

const METRIC_OPTIONS = [
  
  { label: "PTA", name: "Public Transit Accessibility", layerId: "publicTransitAccessibility" },
  { label: "RA", name: "Restaurant Accessibility", layerId: "restaurantAccessibility" },
  { label: "A", name: "Accessibility", layerId: "accessibility" },
  { label: "AN", name: "Access to Nature", layerId: "accessToNature" },
  { label: "UH", name: "Urban Heat", layerId: "urbanHeatH3" }
  
];

function normalizeMetricKey(value) {
  return String(value || "")
    .trim()
    .replace(/[\s_-]+/g, "")
    .toUpperCase();
}

function metricLayerIdFromTableValue(value) {
  if (!value) return null;

  const rawValue = String(value).trim();
  const raw = normalizeMetricKey(value);
  const selectedMetric = METRIC_OPTIONS.find(
    (option) =>
      normalizeMetricKey(option.label) === raw ||
      normalizeMetricKey(option.name) === raw ||
      normalizeMetricKey(option.layerId) === raw
  );

  return selectedMetric?.layerId || (rawValue.length > 0 ? rawValue : null);
}

function metricValueFromCityIOData(cityIOdata) {
  return (
    cityIOdata?.selectedLayerId ??
    cityIOdata?.selected_layer_id ??
    cityIOdata?.layerID ??
    cityIOdata?.layerId ??
    cityIOdata?.layer_id ??
    cityIOdata?.metricCode ??
    cityIOdata?.metric_code ??
    cityIOdata?.metric ??
    cityIOdata?.moduleData?.selectedLayerId ??
    cityIOdata?.moduleData?.layerID ??
    cityIOdata?.moduleData?.layerId ??
    cityIOdata?.moduleData?.metricCode ??
    cityIOdata?.MODULE?.moduleData?.selectedLayerId ??
    cityIOdata?.MODULE?.moduleData?.layerID ??
    cityIOdata?.MODULE?.moduleData?.layerId ??
    cityIOdata?.MODULE?.moduleData?.metricCode
  );
}

function layerMatchesMetricId(layer, metricLayerId) {
  if (!layer || !metricLayerId) return false;

  const target = normalizeMetricKey(metricLayerId);
  const candidates = [
    layer.id,
    layer.name,
    layer.label,
    layer.layerId,
    layer.layerID,
    layer.properties?.id,
    layer.properties?.name,
    layer.properties?.label,
    layer.properties?.layerId,
    layer.properties?.layerID,
    layer.metricId,
    layer.metric_id,
    layer.properties?.metricId,
    layer.properties?.metric_id,
  ].filter(Boolean);

  return candidates.some((candidate) => normalizeMetricKey(candidate) === target);
}

function readHeightValue(cell) {
  if (!cell) return 0;

  const rawHeight =
    cell.height ??
    cell.building_height ??
    cell.buildingHeight ??
    cell.slider_height ??
    cell.height_slider ??
    cell.heightSlider ??
    0;

  let heightValue = 0;

  if (Array.isArray(rawHeight)) {
    if (rawHeight.length >= 2) {
      heightValue = Number(rawHeight[1]);
    } else if (rawHeight.length === 1) {
      heightValue = Number(rawHeight[0]);
    }
  } else {
    heightValue = Number(rawHeight);
  }

  return Number.isNaN(heightValue) ? 0 : heightValue;
}

function parseColorValue(rawColor) {
  if (Array.isArray(rawColor)) {
    const color = [
      Number(rawColor[0]) || 0,
      Number(rawColor[1]) || 0,
      Number(rawColor[2]) || 0,
    ];
    return color;
  }

  if (rawColor && typeof rawColor === "object") {
    const nestedColor =
      rawColor.rgb ||
      rawColor.rgba ||
      rawColor.color ||
      rawColor.color_rgb ||
      rawColor.fillColor ||
      rawColor.fill_color_rgb;

    if (nestedColor && nestedColor !== rawColor) {
      const parsedNestedColor = parseColorValue(nestedColor);
      if (parsedNestedColor) return parsedNestedColor;
    }

    const r = rawColor.r ?? rawColor.red ?? rawColor[0];
    const g = rawColor.g ?? rawColor.green ?? rawColor[1];
    const b = rawColor.b ?? rawColor.blue ?? rawColor[2];

    if (r !== undefined && g !== undefined && b !== undefined) {
      return [Number(r) || 0, Number(g) || 0, Number(b) || 0];
    }
  }

  if (typeof rawColor === "string") {
    const trimmed = rawColor.trim();

    if (trimmed.startsWith("#")) {
      const hex = trimmed.replace("#", "");
      if (hex.length === 3) {
        return hex.split("").map((value) => parseInt(value + value, 16));
      }
      if (hex.length >= 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
        ];
      }
    }

    const numbers = trimmed.match(/\d+(\.\d+)?/g);
    if (numbers && numbers.length >= 3) {
      return [Number(numbers[0]) || 0, Number(numbers[1]) || 0, Number(numbers[2]) || 0];
    }
  }

  return null;
}

function normalizeColor(rawColor, fallback = [255, 255, 255]) {
  return parseColorValue(rawColor) || fallback;
}

function isBlackColor(color) {
  return Array.isArray(color) && color[0] === 0 && color[1] === 0 && color[2] === 0;
}

function findSensorBlockCell(geogridData) {
  if (!Array.isArray(geogridData)) return null;

  return (
    geogridData.find((cell) => String(cell?.id) === "99") ||
    geogridData.find((cell) => String(cell?.grid_id) === "99") ||
    geogridData.find((cell) => String(cell?.cell_id) === "99") ||
    null
  );
}

function getCellDisplayName(cell) {
  return (
    cell?.name ||
    cell?.land_use ||
    cell?.type ||
    cell?.use ||
    cell?.piece ||
    cell?.pieceType ||
    cell?.piece_type ||
    "Sensor block"
  );
}

function getRawCellColor(cell) {
  return (
    cell?.pieceColor ??
    cell?.piece_color ??
    cell?.readPieceColor ??
    cell?.read_piece_color ??
    cell?.displayColor ??
    cell?.display_color ??
    cell?.buildingColor ??
    cell?.building_color ??
    cell?.fillColor ??
    cell?.fill_color_rgb ??
    cell?.color_rgb ??
    cell?.rgb ??
    cell?.color
  );
}

function findMatchingPieceColor(sensorBlockCell, geogridData) {
  if (!sensorBlockCell || !Array.isArray(geogridData)) return null;

  const sensorLabel = normalizeMetricKey(getCellDisplayName(sensorBlockCell));
  if (!sensorLabel || sensorLabel === normalizeMetricKey("Sensor block")) return null;

  for (const cell of geogridData) {
    if (!cell || cell === sensorBlockCell || String(cell.id) === "99") continue;
    if (normalizeMetricKey(getCellDisplayName(cell)) !== sensorLabel) continue;

    const parsedColor = parseColorValue(getRawCellColor(cell));
    if (parsedColor && !isBlackColor(parsedColor)) return parsedColor;
  }

  return null;
}

function getCellDisplayColor(cell, geogridData) {
  const directColor = parseColorValue(getRawCellColor(cell));
  const matchingPieceColor = findMatchingPieceColor(cell, geogridData);

  if (matchingPieceColor && (!directColor || isBlackColor(directColor))) {
    return matchingPieceColor;
  }

  return directColor || matchingPieceColor || [255, 255, 255];
}

function getActiveBuildingInfo(cityIOdata) {
  const geogridData = cityIOdata?.GEOGRIDDATA;

  if (!Array.isArray(geogridData)) {
    return {
      height: 0,
      color: [255, 255, 255],
      name: "Sensor block",
    };
  }

  const sensorBlockCell = findSensorBlockCell(geogridData);

  if (sensorBlockCell) {
    return {
      height: readHeightValue(sensorBlockCell),
      color: getCellDisplayColor(sensorBlockCell, geogridData),
      name: getCellDisplayName(sensorBlockCell),
    };
  }

  return {
    height: 0,
    color: [255, 255, 255],
    name: "Sensor block 99 not found",
  };
}

function ControlsBackground() {
  return (
    <div
      style={{
        position: "fixed",
        zIndex: 10,
        left: 1140,
        top: 650,
        width: 460,
        height: 270,
        backgroundColor: "black",
        pointerEvents: "none",
      }}
    />
  );
}

function ProjectionLegend({ selectedLayerId, cityIOdata }) {
  const activeBuilding = getActiveBuildingInfo(cityIOdata);
  const activeHeight = activeBuilding.height;
  const activeColor = activeBuilding.color;
  const activeName = activeBuilding.name;

  const heightRatio = Math.max(0, Math.min(1, activeHeight / 10));
  const projectedBuildingHeight = heightRatio * 140;

  return (
    <div
      style={{
        position: "fixed",
        zIndex: 20,
        left: 1240,
        top: 660,
        color: "white",
        fontFamily: "sans-serif, helvetica, arial",
        fontWeight: "900",
        pointerEvents: "none",
        textShadow: "0 0 4px black, 0 0 8px black, 0 0 12px black",
      }}
    >
      <div style={{ position: "relative", width: 360, height: 230, fontSize: 14 }}>
        <div
          style={{
            position: "absolute",
            left: -80,
            bottom: 75,
            width: 24,
            height: projectedBuildingHeight,
            backgroundColor: `rgba(${activeColor[0]}, ${activeColor[1]}, ${activeColor[2]}, 0.95)`,
            border: "2px solid white",
            boxShadow: `0 0 8px rgba(${activeColor[0]}, ${activeColor[1]}, ${activeColor[2]}, 0.95), 0 0 10px black`,
            transformOrigin: "bottom center",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 78,
            top: 65,
            width: 50,
            height: 50,
            backgroundColor: `rgba(${activeColor[0]}, ${activeColor[1]}, ${activeColor[2]}, 0.85)`,
            border: "2px solid rgba(255, 255, 255, 0.4)",
            boxShadow: `0 0 15px rgba(${activeColor[0]}, ${activeColor[1]}, ${activeColor[2]}, 0.6)`,
            borderRadius: "2px",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 42,
            top: 125,
            width: 100,
            textAlign: "center",
            fontSize: 9,
            color: "rgba(255, 255, 255, 0.85)",
            fontWeight: "700",
          }}
        >
          {activeName}
        </div>

        <div style={{ position: "absolute", left: -35, top: 170 }}>HEIGHT</div>
        <div style={{ position: "absolute", left: 150, top: 170 }}>METRIC</div>

        <div style={{ position: "absolute", left: 240, top: 10, lineHeight: "32px" }}>
          {METRIC_OPTIONS.map((option) => (
            <div
              key={option.layerId}
              style={{
                color: option.layerId === selectedLayerId ? "rgb(255, 70, 70)" : "white",
                fontWeight: option.layerId === selectedLayerId ? "900" : "700",
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProjectionDeckMap(props) {
  const [layersToRender, setLayersToRender] = useState([]);
  const [layerInfo, setLayerInfo] = useState(null);

  const cityIOdata = props.cityIOdata;
  const viewStateEditMode = props.viewStateEditMode;
  const selectedMetricValue = props.selectedLayerId ?? metricValueFromCityIOData(cityIOdata);
  const selectedLayerId = metricLayerIdFromTableValue(selectedMetricValue);
  const GEOGRID = cityIOdata?.GEOGRID;

  const getModuleLayers = (sourceData) => {
    if (!sourceData) return [];

    if (Array.isArray(sourceData.LAYERS)) return sourceData.LAYERS;
    if (Array.isArray(sourceData.deckgl)) return sourceData.deckgl;

    if (Array.isArray(sourceData.moduleData?.layers)) {
      return sourceData.moduleData.layers;
    }

    if (Array.isArray(sourceData.MODULE?.moduleData?.layers)) {
      return sourceData.MODULE.moduleData.layers;
    }

    if (Array.isArray(sourceData.MODULE?.layers)) {
      return sourceData.MODULE.layers;
    }

    if (Array.isArray(sourceData.modules)) {
      for (const module of sourceData.modules) {
        if (Array.isArray(module?.moduleData?.layers)) {
          return module.moduleData.layers;
        }

        if (Array.isArray(module?.layers)) {
          return module.layers;
        }
      }
    }

    if (typeof sourceData.modules === "object" && sourceData.modules !== null) {
      for (const module of Object.values(sourceData.modules)) {
        if (Array.isArray(module?.moduleData?.layers)) {
          return module.moduleData.layers;
        }

        if (Array.isArray(module?.layers)) {
          return module.layers;
        }
      }
    }

    return [];
  };

  const pushGridOnTop = (layerArray) => {
    if (!cityIOdata || !GEOGRID) return;

    const gridLayers = createMeshLayer(cityIOdata, GEOGRID, OBJLoader);

    if (Array.isArray(gridLayers)) {
      layerArray.push(...gridLayers);
    } else {
      layerArray.push(gridLayers);
    }
  };

  const findSelectedLayer = (currentLayers) => {
    if (!Array.isArray(currentLayers) || currentLayers.length === 0) {
      return null;
    }

    if (!selectedLayerId) {
      return currentLayers[0];
    }

    const selectedLayer = currentLayers.find((layer) =>
      layerMatchesMetricId(layer, selectedLayerId)
    );

    if (!selectedLayer) {
      console.warn(
        "No projection layer matched selected metric:",
        selectedLayerId,
        "raw value:",
        selectedMetricValue,
        currentLayers.map((layer) => ({
          id: layer.id,
          name: layer.name,
          label: layer.label,
          layerId: layer.layerId,
          layerID: layer.layerID,
          propertiesId: layer.properties?.id,
          propertiesName: layer.properties?.name,
          type: layer.type,
        }))
      );
      return null;
    }

    return selectedLayer;
  };

  const findSelectedLayers = (currentLayers) => {
    if (!Array.isArray(currentLayers) || currentLayers.length === 0) {
      return [];
    }

    if (!selectedLayerId) {
      return [currentLayers[0]];
    }

    if (!findSelectedLayer(currentLayers)) {
      return [];
    }

    return currentLayers.filter((layer) => layerMatchesMetricId(layer, selectedLayerId));
  };

  const createDeckLayer = (layerIndex, layer) => {
    if (!GEOGRID || !layer) return null;

    const layerType = layer.type;

    if (layerType === "heatmap") return createHeatmapLayer(layerIndex, layer, GEOGRID);
    if (layerType === "arc") return createArcLayer(layerIndex, layer, GEOGRID);
    if (layerType === "geojson" || layerType === "geojsonbase") {
      return createGeoJsonLayer(layerIndex, layer, GEOGRID);
    }
    if (layerType === "path") return createPathLayer(layerIndex, layer, GEOGRID);
    if (layerType === "h3cluster") return createH3ClusterLayer(layerIndex, layer, GEOGRID);

    console.error("Layer type not supported:", layerType, layer);
    setLayerInfo(`Layer type not yet supported: ${layerType}`);
    return null;
  };

  const createLayersArray = () => {
    if (!cityIOdata || !GEOGRID) {
      setLayersToRender([]);
      setLayerInfo(null);
      return;
    }

    const layerArray = [createTileLayer()];

    const currentLayers = getModuleLayers(cityIOdata);
    const selectedLayers = findSelectedLayers(currentLayers);

    console.log("Projection selected metric raw:", selectedMetricValue);
    console.log("Projection selected metric layerId:", selectedLayerId);
    console.log("Projection selected layers:", selectedLayers);
    console.log("Projection currentLayers:", currentLayers);

    if (selectedLayers.length === 0) {
      setLayerInfo(selectedLayerId ? `No layer matched ${selectedLayerId}` : "No module layers found");
      pushGridOnTop(layerArray);
      setLayersToRender(layerArray);
      return;
    }

    if (selectedLayers.length === 1) {
      const selectedLayer = selectedLayers[0];
      const selectedLayerIndex = currentLayers.indexOf(selectedLayer);
      setLayerInfo(selectedLayer.id || `Layer ${selectedLayerIndex + 1}`);
    } else {
      setLayerInfo(selectedLayerId || selectedMetricValue || "Metric");
    }

    for (const selectedLayer of selectedLayers) {
      const selectedLayerIndex = currentLayers.indexOf(selectedLayer);
      const deckLayer = createDeckLayer(selectedLayerIndex, selectedLayer);
      if (deckLayer) {
        layerArray.push(deckLayer);
      }
    }

    pushGridOnTop(layerArray);
    setLayersToRender(layerArray);
  };

  useEffect(() => {
    createLayersArray();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityIOdata, selectedLayerId, selectedMetricValue]);

  if (!cityIOdata || !GEOGRID) {
    return null;
  }

  return (
    <>
      {layerInfo && (
        <div
          style={{
            position: "absolute",
            zIndex: 4,
            bottom: 0,
            left: 0,
            paddingLeft: 10,
            paddingRight: 10,
            margin: 10,
            color: "white",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            borderRadius: 5,
            fontFamily: "sans-serif, helvetica, arial",
          }}
        >
          <h3>{layerInfo}</h3>
        </div>
      )}

      <ControlsBackground />

      <ProjectionLegend selectedLayerId={selectedLayerId} cityIOdata={cityIOdata} />

      <DeckMap
        header={cityIOdata.GEOGRID.properties.header}
        viewStateEditMode={viewStateEditMode}
        layersArray={layersToRender}
      />
    </>
  );
}
