import { useState, useEffect, useRef } from "react";
import ProjectionDeckMap from "./ProjectionDeckMap";
import Keystoner from "./Components/Keystoner";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { getCityIOUrl } from "../settings/settings";

const NO_METRIC_SELECTED = "__no_metric_selected__";

function normalizeMetricSelection(value) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function readMetricCode(source) {
  if (!source || typeof source !== "object") return null;

  const candidates = [
    source.layerID,
    source.layerId,
    source.layer_id,
    source.selectedLayerId,
    source.selected_layer_id,
    source.selectedMetric,
    source.selected_metric,
    source.selectedIndicator,
    source.selected_indicator,
    source.metricCode,
    source.metric_code,
    source.metric,
  ];

  for (const candidate of candidates) {
    const metric = normalizeMetricSelection(candidate);
    if (metric) return metric;
  }

  return null;
}

function readMetricCodeFromMessage(message) {
  if (!message || typeof message !== "object") return null;

  const content = message.content || {};
  const snapshot = content.snapshot || {};
  const moduleData = content.moduleData || {};
  const sources = [content, snapshot, moduleData, snapshot.moduleData, message];

  for (const source of sources) {
    const metric = readMetricCode(source);
    if (metric) return metric;
  }

  for (const source of sources) {
    const cellCollections = Array.isArray(source)
      ? [source]
      : [source?.GEOGRIDDATA, source?.geogriddata];

    for (const cells of cellCollections) {
      if (!Array.isArray(cells)) continue;

      for (const cell of cells) {
        const metric = readMetricCode(cell) || readMetricCode(cell?.properties);
        if (metric) return metric;
      }
    }
  }

  return null;
}

export default function ProjectionMapping(props) {
  const tableName = props.tableName;
  // state to store the cityIO data
  const [cityIOData, setCityIOData] = useState();
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const explicitMetricRef = useRef(null);

  useEffect(() => {
    console.log("Selected metric state:", selectedLayerId);
  }, [selectedLayerId]);

  const { readyState, sendJsonMessage, lastJsonMessage } = useWebSocket(
    //  get cityIO url from the settings
    getCityIOUrl.current,
    {
      share: true,
      shouldReconnect: () => true,
    }
  );

  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      sendJsonMessage({
        type: "LISTEN",
        content: {
          gridId: tableName,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyState]);

  // when lastJsonMessage updates, print it to the console
  useEffect(() => {
    if (!lastJsonMessage) return;

    const incomingMetricCode = readMetricCodeFromMessage(lastJsonMessage);
    console.log("CityIO raw metric value:", incomingMetricCode);
    const isModuleEcho =
      lastJsonMessage.type === "MODULE" &&
      !readMetricCode(lastJsonMessage.content) &&
      !readMetricCode(lastJsonMessage);
    if (incomingMetricCode && !isModuleEcho) {
      explicitMetricRef.current = incomingMetricCode;
    }
    const selectedMetricCode = isModuleEcho
      ? explicitMetricRef.current || incomingMetricCode
      : incomingMetricCode;

    if (selectedMetricCode) {
      console.log("Table metric code selected:", selectedMetricCode, lastJsonMessage);
      setSelectedLayerId(selectedMetricCode);
      setCityIOData((prev) => ({
        ...prev,
        selectedLayerId: selectedMetricCode,
      }));
    }

    if (lastJsonMessage.type === "TABLE_SNAPSHOT") {
      console.log("Socket open with", tableName, lastJsonMessage);
      const cityIOdata = lastJsonMessage.content;
      const snapshot = cityIOdata.snapshot || cityIOdata;
      const metricCode = selectedMetricCode;

      setCityIOData((prev) => ({
        ...snapshot,
        selectedLayerId: metricCode || prev?.selectedLayerId || null,
      }));
      const numCols = snapshot.GEOGRID.properties.header.ncols;
      const numRows = snapshot.GEOGRID.properties.header.nrows;
      setTableRatio(numCols / numRows);
      console.log("Table ratio: ", numCols / numRows);
    } else if (
  lastJsonMessage.type === "GEOGRIDDATA_UPDATE" ||
  lastJsonMessage.type === "UPDATE_GRID"
) {
  const content = lastJsonMessage.content || {};
  const geogriddata = content.geogriddata || content.GEOGRIDDATA || content;
  const metricCode = selectedMetricCode;

  setCityIOData((prev) => {
    const selectedMetric =
      metricCode ||
      content.selectedLayerId ||
      content.layerID ||
      content.layerId ||
      content.metricCode ||
      prev?.selectedLayerId ||
      null;

    return {
      ...prev,
      ...content,
      GEOGRIDDATA: geogriddata,

      selectedLayerId: selectedMetric,
      selected_layer_id: selectedMetric,
      layerID: selectedMetric,
      layerId: selectedMetric,
      metricCode: selectedMetric,
    };
  });
      // if the lastJsonMessage is of type "INDICATOR", log it
    } else if (lastJsonMessage.type === "MODULE") {
      const content = lastJsonMessage.content || {};
      const moduleData = content.moduleData || {};
      const metricCode = selectedMetricCode;

      setCityIOData((prev) => {
      const selectedMetric =
        metricCode ||
        content.selectedLayerId ||
        content.layerID ||
        content.layerId ||
        content.metricCode ||
        moduleData.selectedLayerId ||
        moduleData.layerID ||
        moduleData.layerId ||
        moduleData.metricCode ||
        prev?.selectedLayerId ||
        null;

      return {
        ...prev,
        ...content,
        moduleData,
        MODULE: content,
        LAYERS: moduleData.layers || content.layers || prev?.LAYERS,

        selectedLayerId: selectedMetric,
        selected_layer_id: selectedMetric,
        layerID: selectedMetric,
        layerId: selectedMetric,
        metricCode: selectedMetric,
      };
    });
      // if the lastJsonMessage is of type "ERROR", log it
    } else if (lastJsonMessage.type === "ERROR") {
      console.error("Error from CityIO", lastJsonMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastJsonMessage]);

  const [editMode, setEditMode] = useState(false);
  const [viewStateEditMode, setViewStateEditMode] = useState(false);
  const [tableRatio, setTableRatio] = useState();

  const clearLocalStorage = () => {
    if (localStorage.getItem("projMap")) {
      localStorage.removeItem("projMap");
    }
    if (localStorage.getItem("projectionViewStateStorage")) {
      localStorage.removeItem("projectionViewStateStorage");
    }
    window.location.reload();
  };

  useEffect(() => {
    console.log("Keystone starting...");
    const onKeyDown = ({ key }) => {
      if (key === " ") {
        setEditMode((editMode) => !editMode);
      }
      // if the key is 'z', display the viewState editor
      if (key === "z") {
        setViewStateEditMode((viewStateEditMode) => !viewStateEditMode);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {tableRatio && (
        <div
          // ! this div's props are
          // ! controlling the projection z-index
          // ! above the menus

          style={{
            height: "100vh",
            width: "100vw",
            overflow: "hidden",
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: 1000,
          }}
        >
          <div>
            <Keystoner
              style={{
                height: "100vh",
                width: `${tableRatio * 100}vh`,
                backgroundColor: editMode ? "red" : null,
                // have 1px border to show the edges of the projection
                border: editMode ? "1px solid red" : "1px solid white",
              }}
              isEditMode={editMode}
            >
              <ProjectionDeckMap
                viewStateEditMode={viewStateEditMode}
                cityIOdata={cityIOData}
                selectedLayerId={selectedLayerId ?? NO_METRIC_SELECTED}
              />
            </Keystoner>
          </div>
        </div>
      )}
      {editMode && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1000,
          }}
        >
          <button onClick={() => clearLocalStorage()}>
            Clear Local Storage
          </button>
        </div>
      )}
    </>
  );
}
