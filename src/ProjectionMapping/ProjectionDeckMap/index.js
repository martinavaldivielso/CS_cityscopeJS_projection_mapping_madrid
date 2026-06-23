/*

Logic to parse through the layers:
* This method assume a new cityIOdata object is propagated on each update on cityIO, so that deeply nested layer update will still rerender this component *

- loop over the cityIOdata.LAYERS
- for LAYER[i] get the layer's type (i.e Trip, Line, Arch, Heatmap, etc)
- for each layer type, populate a deckgl layer instance
- if the layer has optional props field, use it to inform the layer props

*/

import { mapSettings as settings } from "../../settings/settings";
import DeckMap from "./BaseMap";
import {
  createHeatmapLayer,
  createMeshLayer,
  createTileLayer,
  createArcLayer,
  createGeoJsonLayer,
  createPathLayer
} from "./layers";
import { useRef, useState, useEffect } from "react";
import { OBJLoader } from "@loaders.gl/obj";

export default function ProjectionDeckMap(props) {
  const indexRef = useRef(0);

  const [layersToRender, setLayersToRender] = useState([]);
  const [layerInfo, setLayerInfo] = useState(null);
  const [selectedLayerIndex, setSelectedLayerIndex] = useState(0);

  const cityIOdata = props.cityIOdata;
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

  const createLayersArray = (forcedIndex = null) => {
    const styles = settings.map.mapStyles;
    const mapStyle = styles.Light;

    const l = [];

    // Keep both true because you want to project the full map over the table.
    const SHOW_BASEMAP = true;
    const SHOW_GRID_MESH = true;

    if (SHOW_BASEMAP) {
      l.push(createTileLayer(mapStyle));
    }

    if (SHOW_GRID_MESH) {
      l.push(createMeshLayer(cityIOdata, GEOGRID, OBJLoader));
    }

    const currentLayers = getModuleLayers(cityIOdata);

    console.log("Projection cityIOdata:", cityIOdata);
    console.log("Projection currentLayers:", currentLayers);
    console.log("Current projection layer index:", indexRef.current);

    if (!currentLayers || currentLayers.length === 0) {
      setLayerInfo("No module layers found");
      setLayersToRender(l);
      return;
    }

    const layerIndex = forcedIndex !== null ? forcedIndex : indexRef.current;

    if (layerIndex >= currentLayers.length || layerIndex < 0) {
      indexRef.current = 0;
    } else {
      indexRef.current = layerIndex;
    }

    const layer = currentLayers[indexRef.current];

    setLayerInfo(layer.id || `Layer ${indexRef.current + 1}`);
    setSelectedLayerIndex(indexRef.current);

    const layerType = layer.type;

    if (layerType === "heatmap") {
      l.push(createHeatmapLayer(indexRef.current, layer, GEOGRID));
    } else if (layerType === "arc") {
      l.push(createArcLayer(indexRef.current, layer, GEOGRID));
    } else if (layerType === "geojson" || layerType === "geojsonbase") {
      l.push(createGeoJsonLayer(indexRef.current, layer, GEOGRID));
    } else if (layerType === "path") {
      l.push(createPathLayer(indexRef.current, layer, GEOGRID));
    } else {
      console.error("Layer type not supported:", layerType, layer);
      setLayerInfo(`Layer type not yet supported: ${layerType}`);
    }

    setLayersToRender(l);
  };

  useEffect(() => {
    createLayersArray();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityIOdata]);

  useEffect(() => {
    function handleKeyDown(event) {
      const currentLayers = getModuleLayers(cityIOdata);

      if (!currentLayers || currentLayers.length === 0) {
        indexRef.current = 0;
        setSelectedLayerIndex(0);
        createLayersArray(0);
        return;
      }

      if (event.key === "Enter" || event.key === "ArrowRight") {
        const nextIndex = (indexRef.current + 1) % currentLayers.length;
        indexRef.current = nextIndex;
        setSelectedLayerIndex(nextIndex);
        createLayersArray(nextIndex);
      }

      if (event.key === "ArrowLeft") {
        const previousIndex =
          (indexRef.current - 1 + currentLayers.length) % currentLayers.length;
        indexRef.current = previousIndex;
        setSelectedLayerIndex(previousIndex);
        createLayersArray(previousIndex);
      }

      const numberPressed = parseInt(event.key, 10);

      if (
        !Number.isNaN(numberPressed) &&
        numberPressed >= 1 &&
        numberPressed <= currentLayers.length
      ) {
        const selectedIndex = numberPressed - 1;
        indexRef.current = selectedIndex;
        setSelectedLayerIndex(selectedIndex);
        createLayersArray(selectedIndex);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityIOdata]);

  const currentLayersForButtons = getModuleLayers(cityIOdata);

  return (
    <>
      {currentLayersForButtons.length > 0 && (
        <div
          style={{
            position: "absolute",
            zIndex: 2,
            top: 10,
            left: 10,
            padding: 10,
            maxWidth: 360,
            backgroundColor: "rgba(0, 0, 0, 0.65)",
            color: "white",
            borderRadius: 6,
            fontFamily: "sans-serif, helvetica, arial",
          }}
        >
          <div style={{ marginBottom: 8, fontWeight: "bold" }}>
            Projection Layers
          </div>

          {currentLayersForButtons.map((layer, i) => (
            <button
              key={layer.id || i}
              onClick={() => {
                indexRef.current = i;
                setSelectedLayerIndex(i);
                createLayersArray(i);
              }}
              style={{
                display: "block",
                width: "100%",
                marginBottom: 5,
                padding: "6px 8px",
                textAlign: "left",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                color: "white",
                backgroundColor:
                  i === selectedLayerIndex
                    ? "rgba(0, 120, 255, 0.9)"
                    : "rgba(255, 255, 255, 0.15)",
              }}
            >
              {i + 1}. {layer.id || `Layer ${i + 1}`}
            </button>
          ))}

          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              opacity: 0.8,
              lineHeight: 1.4,
            }}
          >
            Enter / → next · ← previous · 1–9 jump
          </div>
        </div>
      )}

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
