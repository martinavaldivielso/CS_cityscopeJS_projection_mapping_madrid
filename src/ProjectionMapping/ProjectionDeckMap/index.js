/*

ProjectionDeckMap

Metric selection is driven by the interactive table slider codes:
UH, AN, A, RA, PTA.

Layer drawing order:
1. basemap
2. selected metric layer
3. interactive grid mesh + labels

*/

import { mapSettings as settings } from "../../settings/settings";
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
  { label: "UH", name: "Urban Heat", layerId: "urbanHeatH3" },
  { label: "AN", name: "Access to Nature", layerId: "accessToNature" },
  { label: "A", name: "Accessibility", layerId: "accessibility" },
  { label: "RA", name: "Restaurant Accessibility", layerId: "restaurantAccessibility" },
  { label: "PTA", name: "Public Transit Accessibility", layerId: "publicTransitAccessibility" },
];

function normalizeMetricKey(value) {
  return String(value || "")
    .trim()
    .replace(/[\s_-]+/g, "")
    .toUpperCase();
}

function metricLayerIdFromTableValue(value) {
  if (!value) return null;

  const raw = normalizeMetricKey(value);
  const selectedMetric = METRIC_OPTIONS.find(
    (option) =>
      normalizeMetricKey(option.label) === raw ||
      normalizeMetricKey(option.name) === raw ||
      normalizeMetricKey(option.layerId) === raw
  );

  return selectedMetric?.layerId || null;
}

function layerMatchesMetricId(layer, metricLayerId) {
  if (!layer || !metricLayerId) return false;

  const target = normalizeMetricKey(metricLayerId);
  const candidates = [
    layer.id,
    layer.name,
    layer.label,
    layer.properties?.id,
    layer.properties?.name,
    layer.properties?.label,
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

function readHeightSliderValue(cityIOdata) {
  const rawHeight =
    cityIOdata?.heightSlider ??
    cityIOdata?.height_slider ??
    cityIOdata?.sliderHeight ??
    cityIOdata?.slider_height ??
    cityIOdata?.heightValue ??
    cityIOdata?.height_value ??
    cityIOdata?.heightSensor ??
    cityIOdata?.height_sensor ??
    cityIOdata?.sensorHeight ??
    cityIOdata?.sensor_height ??
    cityIOdata?.height;

  if (rawHeight === undefined || rawHeight === null) return null;
  return readHeightValue({ height: rawHeight });
}

function normalizeColor(rawColor) {
  if (Array.isArray(rawColor)) {
    return [
      Number(rawColor[0]) || 0,
      Number(rawColor[1]) || 0,
      Number(rawColor[2]) || 0,
    ];
  }

  return [255, 255, 255];
}

function isActiveBuildingCell(cell) {
  if (!cell) return false;

  const name = cell.name || cell.land_use || cell.type || cell.use || "";
  const text = String(name).toLowerCase();

  return !["", "none", "empty", "0", "0f"].includes(text);
}

function getActiveBuildingInfo(cityIOdata) {
  const geogridData = cityIOdata?.GEOGRIDDATA;
  const heightSliderValue = readHeightSliderValue(cityIOdata);

  if (!Array.isArray(geogridData)) {
    return {
      height: heightSliderValue ?? 0,
      color: [255, 255, 255],
      name: "Empty",
    };
  }

  let activeCell = null;
  let maxHeight = 0;

  for (const cell of geogridData) {
    if (!cell) continue;

    const heightValue = readHeightValue(cell);

    if (heightValue > maxHeight && isActiveBuildingCell(cell)) {
      maxHeight = heightValue;
      activeCell = cell;
    }
  }

  if (!activeCell) {
    for (const cell of geogridData) {
      if (!cell) continue;

      const heightValue = readHeightValue(cell);

      if (heightValue > maxHeight) {
        maxHeight = heightValue;
        activeCell = cell;
      }
    }
  }

  if (!activeCell) {
    return {
      height: 0,
      color: [255, 255, 255],
      name: "Empty",
    };
  }

  const rawColor =
    activeCell.color ||
    activeCell.color_rgb ||
    activeCell.rgb ||
    activeCell.fillColor ||
    activeCell.fill_color_rgb;

  const name =
    activeCell.name ||
    activeCell.land_use ||
    activeCell.type ||
    activeCell.use ||
    "Building";

  return {
    height: heightSliderValue ?? maxHeight,
    color: normalizeColor(rawColor),
    name,
  };
}

function ControlsBackground() {
  return (
    <div
      style={{
        position: "fixed",
        zIndex: 10,
        left: 1100,
        top: 630,
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
            left: 65,
            top: 55,
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
            top: 115,
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
  const selectedLayerId = metricLayerIdFromTableValue(
    props.selectedLayerId || cityIOdata?.selectedLayerId
  );
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
        currentLayers.map((layer) => ({
          id: layer.id,
          name: layer.name,
          propertiesName: layer.properties?.name,
          type: layer.type,
        }))
      );
      return currentLayers[0];
    }

    return selectedLayer;
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

    const styles = settings.map.mapStyles;
    const mapStyle = styles.Light;
    const layerArray = [createTileLayer(mapStyle)];

    const currentLayers = getModuleLayers(cityIOdata);
    const selectedLayer = findSelectedLayer(currentLayers);
    const selectedLayerIndex = selectedLayer ? currentLayers.indexOf(selectedLayer) : 0;

    console.log("Projection selected metric:", selectedLayerId);
    console.log("Projection selected layer:", selectedLayer);
    console.log("Projection currentLayers:", currentLayers);

    if (!selectedLayer) {
      setLayerInfo("No module layers found");
      pushGridOnTop(layerArray);
      setLayersToRender(layerArray);
      return;
    }

    setLayerInfo(selectedLayer.id || `Layer ${selectedLayerIndex + 1}`);

    const deckLayer = createDeckLayer(selectedLayerIndex, selectedLayer);
    if (deckLayer) {
      layerArray.push(deckLayer);
    }

    pushGridOnTop(layerArray);
    setLayersToRender(layerArray);
  };

  useEffect(() => {
    createLayersArray();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityIOdata, selectedLayerId]);

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
