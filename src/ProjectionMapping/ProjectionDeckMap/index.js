/*

Logic to parse through the layers:
* This method assumes a new cityIOdata object is propagated on each update on CityIO,
so that deeply nested layer updates will still rerender this component.

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

const layerAliases = {
  AN: "accessToNature",
  ACCESS_TO_NATURE: "accessToNature",
  NATURE: "accessToNature",
  ACCESSIBILITY: "accessibility",
  ACC: "accessibility",
  GA: "accessibility",
  GENERAL_ACCESSIBILITY: "accessibility",
  RA: "restaurantAccessibility",
  RESTAURANT: "restaurantAccessibility",
  RESTAURANT_ACCESSIBILITY: "restaurantAccessibility",
  PT: "publicTransitAccessibility",
  PTA: "publicTransitAccessibility",
  TRANSIT: "publicTransitAccessibility",
  PUBLIC_TRANSIT: "publicTransitAccessibility",
  PUBLIC_TRANSIT_ACCESSIBILITY: "publicTransitAccessibility",
  UH: "urbanHeatH3",
  UHI: "urbanHeatH3",
  HEAT: "urbanHeatH3",
  URBAN_HEAT: "urbanHeatH3",
  URBAN_HEAT_H3: "urbanHeatH3",
  URBAN_HEAT_HEATMAP: "urbanHeatHeatmap",
};

function normalizeLayerLabel(value) {
  return String(value || "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

function canonicalLayerId(value) {
  if (!value) return null;
  const normalized = normalizeLayerLabel(value);
  return layerAliases[normalized] || String(value).trim();
}

function layerMatchesLabel(layer, label) {
  const target = canonicalLayerId(label);

  if (!target || !layer) {
    return false;
  }

  const candidates = [
    layer.id,
    layer.name,
    layer.label,
    layer.properties?.id,
    layer.properties?.name,
    layer.properties?.label,
  ].filter(Boolean);

  return candidates.some((candidate) => {
    const canonicalCandidate = canonicalLayerId(candidate);
    return (
      canonicalCandidate === target ||
      normalizeLayerLabel(canonicalCandidate) === normalizeLayerLabel(target)
    );
  });
}

export default function ProjectionDeckMap(props) {
  const indexRef = useRef(0);

  const [layersToRender, setLayersToRender] = useState([]);
  const [layerInfo, setLayerInfo] = useState(null);

  const cityIOdata = props.cityIOdata;
  const selectedLayerId = props.selectedLayerId || cityIOdata.selectedLayerId;
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

    // Basemap first.
    const SHOW_BASEMAP = true;

    // Grid must be pushed LAST so it appears above metrics.
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
            zIndex: 1,
            bottom: 0,
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

      <DeckMap
        header={cityIOdata.GEOGRID.properties.header}
        viewStateEditMode={viewStateEditMode}
        layersArray={layersToRender}
      />
    </>
  );
}
