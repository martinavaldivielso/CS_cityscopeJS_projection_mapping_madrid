/*

ProjectionDeckMap

Current behavior:
1. Metric is selected by the interactive table slider through CityIO layerID.
2. Interactive grid is drawn on top of the metric layer.
3. Projected text legend is added near the lower-right corner.
4. A projected building height indicator is shown next to HEIGHT.
5. The projected building uses the same color as the active interactive piece / building type.

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
import { useRef, useState, useEffect } from "react";
import { OBJLoader } from "@loaders.gl/obj";

const METRIC_OPTIONS = [
  {
    label: "UH",
    name: "Urban Heat",
    layerId: "urbanHeatH3",
  },
  {
    label: "AN",
    name: "Access to Nature",
    layerId: "accessToNature",
  },
  {
    label: "A",
    name: "Accessibility",
    layerId: "accessibility",
  },
  {
    label: "RA",
    name: "Restaurant Accessibility",
    layerId: "restaurantAccessibility",
  },
  {
    label: "PTA",
    name: "Public Transit Accessibility",
    layerId: "publicTransitAccessibility",
  },
];

function normalizeMetricLabel(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function metricLayerIdFromTableValue(value) {
  if (!value) return null;

  const rawValue = String(value).trim();
  const selectedMetric = METRIC_OPTIONS.find(
    (option) =>
      normalizeMetricLabel(option.label) === normalizeMetricLabel(rawValue) ||
      option.layerId === rawValue
  );

  return selectedMetric?.layerId || null;
}

function layerMatchesLabel(layer, label) {
  const target = metricLayerIdFromTableValue(label);

  if (!target || !layer) {
    return false;
  }

  const candidates = [
    layer.id,
    layer.properties?.id,
  ].filter(Boolean);

  return candidates.some((candidate) => String(candidate).trim() === target);
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

  // CityScope heights are often [min, current, max].
  if (Array.isArray(rawHeight)) {
    if (rawHeight.length >= 2) {
      heightValue = Number(rawHeight[1]);
    } else if (rawHeight.length === 1) {
      heightValue = Number(rawHeight[0]);
    }
  } else {
    heightValue = Number(rawHeight);
  }

  if (Number.isNaN(heightValue)) {
    return 0;
  }

  return heightValue;
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

  if (rawHeight === undefined || rawHeight === null) {
    return null;
  }

  return readHeightValue({ height: rawHeight });
}

function normalizeColor(rawColor) {
  if (!rawColor) {
    return [255, 255, 255];
  }

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

  const name =
    cell.name ||
    cell.land_use ||
    cell.type ||
    cell.use ||
    "";

  const text = String(name).toLowerCase();

  if (
    text === "" ||
    text === "none" ||
    text === "empty" ||
    text === "0" ||
    text === "0f"
  ) {
    return false;
  }

  return true;
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

    // Prefer a placed/active building with height.
    if (heightValue > maxHeight && isActiveBuildingCell(cell)) {
      maxHeight = heightValue;
      activeCell = cell;
    }
  }

  // Fallback: use the tallest cell even if the name is not recognized.
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
    activeCell.fill_color_rgb ||
    [255, 255, 255];

  const color = normalizeColor(rawColor);

  const name =
    activeCell.name ||
    activeCell.land_use ||
    activeCell.type ||
    activeCell.use ||
    "Building";

  return {
    height: heightSliderValue ?? maxHeight,
    color,
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
  const LEGEND_LEFT = 1240;
  const LEGEND_TOP = 660;

  const activeBuilding = getActiveBuildingInfo(cityIOdata);
  const activeHeight = activeBuilding.height;
  const activeColor = activeBuilding.color;
  const activeName = activeBuilding.name;

  // 1. Proportional Height Calculation
  const MAX_HEIGHT = 10; // Change this if your real slider max floor value is different
  const heightRatio = Math.max(0, Math.min(1, activeHeight / MAX_HEIGHT));

  const BUILDING_BASE_WIDTH = 24;
  const BUILDING_MIN_HEIGHT = 0;
  
  const BUILDING_MAX_HEIGHT = 140; 

  const projectedBuildingHeight =
    BUILDING_MIN_HEIGHT +
    heightRatio * (BUILDING_MAX_HEIGHT - BUILDING_MIN_HEIGHT);

  return (
    <div
      style={{
        position: "fixed",
        zIndex: 20,
        left: LEGEND_LEFT,
        top: LEGEND_TOP,
        color: "white",
        fontFamily: "sans-serif, helvetica, arial",
        fontWeight: "900",
        pointerEvents: "none",
        textShadow: "0 0 4px black, 0 0 8px black, 0 0 12px black",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 360,
          height: 230,
          fontSize: 14,
        }}
      >
        {/* Height indicator bar*/}
        <div
          style={{
            position: "absolute",
            left: -80,                  
            bottom: 75,               
            width: BUILDING_BASE_WIDTH,
            height: projectedBuildingHeight, 
            backgroundColor: `rgba(${activeColor[0]}, ${activeColor[1]}, ${activeColor[2]}, 0.95)`,
            border: "2px solid white",
            boxShadow: `0 0 8px rgba(${activeColor[0]}, ${activeColor[1]}, ${activeColor[2]}, 0.95), 0 0 10px black`,
            transformOrigin: "bottom center",
          }}
        />

        {/* Dynamic Sensor Grid Square Projection */}
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

        {/* Building type label */}
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

        <div
          style={{
            position: "absolute",
            left: -35,
            top: 170,
          }}
        >
          HEIGHT
        </div>

        <div
          style={{
            position: "absolute",
            left: 150,
            top: 170,
          }}
        >
          METRIC
        </div>

        <div
          style={{
            position: "absolute",
            left: 240,
            top: 10,
            lineHeight: "32px",
          }}
        >
          {METRIC_OPTIONS.map((option) => (
            <div
              key={option.layerId}
              style={{
                color:
                  option.layerId === selectedLayerId
                    ? "rgb(255, 70, 70)"
                    : "white",
                fontWeight:
                  option.layerId === selectedLayerId ? "900" : "700",
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
  const indexRef = useRef(0);

  const [layersToRender, setLayersToRender] = useState([]);
  const [layerInfo, setLayerInfo] = useState(null);

  const cityIOdata = props.cityIOdata;
  const selectedLayerId = metricLayerIdFromTableValue(
    props.selectedLayerId || cityIOdata?.selectedLayerId
  );
  const viewStateEditMode = props.viewStateEditMode;
  const GEOGRID = cityIOdata.GEOGRID;

  const getModuleLayers = (cityIOdata) => {
    if (!cityIOdata) return [];

    if (Array.isArray(cityIOdata.LAYERS)) return cityIOdata.LAYERS;
    if (Array.isArray(cityIOdata.deckgl)) return cityIOdata.deckgl;

    if (Array.isArray(cityIOdata.moduleData?.layers)) {
      return cityIOdata.moduleData.layers;
    }

    if (Array.isArray(cityIOdata.MODULE?.moduleData?.layers)) {
      return cityIOdata.MODULE.moduleData.layers;
    }

    if (Array.isArray(cityIOdata.MODULE?.layers)) {
      return cityIOdata.MODULE.layers;
    }

    if (Array.isArray(cityIOdata.modules)) {
      for (const module of cityIOdata.modules) {
        if (Array.isArray(module?.moduleData?.layers)) {
          return module.moduleData.layers;
        }

        if (Array.isArray(module?.layers)) {
          return module.layers;
        }
      }
    }

    if (typeof cityIOdata.modules === "object" && cityIOdata.modules !== null) {
      for (const module of Object.values(cityIOdata.modules)) {
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
    const gridLayers = createMeshLayer(cityIOdata, GEOGRID, OBJLoader);

    if (Array.isArray(gridLayers)) {
      layerArray.push(...gridLayers);
    } else {
      layerArray.push(gridLayers);
    }
  };

  const layerIndexFromTableSelection = (currentLayers) => {
    if (!selectedLayerId) {
      return null;
    }

    const selectedIndex = currentLayers.findIndex((layer) =>
      layerMatchesLabel(layer, selectedLayerId)
    );

    if (selectedIndex < 0) {
      console.warn(
        "No projection layer matched table layerID:",
        selectedLayerId,
        currentLayers.map((layer) => layer.id || layer.name || layer.label)
      );
      return null;
    }

    return selectedIndex;
  };

  const createLayersArray = () => {
    const styles = settings.map.mapStyles;
    const mapStyle = styles.Light;

    const l = [];

    const SHOW_BASEMAP = true;
    const SHOW_GRID_MESH = true;

    if (SHOW_BASEMAP) {
      l.push(createTileLayer(mapStyle));
    }

    const currentLayers = getModuleLayers(cityIOdata);

    console.log("Projection cityIOdata:", cityIOdata);
    console.log("Projection currentLayers:", currentLayers);
    console.log("Current projection layer index:", indexRef.current);
    console.log("Current table layerID:", selectedLayerId);

    if (!currentLayers || currentLayers.length === 0) {
      setLayerInfo("No module layers found");

      if (SHOW_GRID_MESH) {
        pushGridOnTop(l);
      }

      setLayersToRender(l);
      return;
    }

    const layerIndex = layerIndexFromTableSelection(currentLayers) ?? indexRef.current;

    if (layerIndex >= currentLayers.length || layerIndex < 0) {
      indexRef.current = 0;
    } else {
      indexRef.current = layerIndex;
    }

    const layer = currentLayers[indexRef.current];

    setLayerInfo(layer.id || `Layer ${indexRef.current + 1}`);

    const layerType = layer.type;

    // Metric layer goes after basemap but before the interactive grid.
    if (layerType === "heatmap") {
      l.push(createHeatmapLayer(indexRef.current, layer, GEOGRID));
    } else if (layerType === "arc") {
      l.push(createArcLayer(indexRef.current, layer, GEOGRID));
    } else if (layerType === "geojson" || layerType === "geojsonbase") {
      l.push(createGeoJsonLayer(indexRef.current, layer, GEOGRID));
    } else if (layerType === "path") {
      l.push(createPathLayer(indexRef.current, layer, GEOGRID));
    } else if (layerType === "h3cluster") {
      l.push(createH3ClusterLayer(indexRef.current, layer, GEOGRID));
    } else {
      console.error("Layer type not supported:", layerType, layer);
      setLayerInfo(`Layer type not yet supported: ${layerType}`);
    }

    // Interactive grid goes LAST, therefore it is rendered on top.
    if (SHOW_GRID_MESH) {
      pushGridOnTop(l);
    }

    setLayersToRender(l);
  };

  useEffect(() => {
    createLayersArray();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityIOdata, selectedLayerId]);

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

      <ProjectionLegend
        selectedLayerId={selectedLayerId}
        cityIOdata={cityIOdata}
      />

      <DeckMap
        header={cityIOdata.GEOGRID.properties.header}
        viewStateEditMode={viewStateEditMode}
        layersArray={layersToRender}
      />
    </>
  );
}
