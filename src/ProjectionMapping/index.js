import { useState, useEffect } from "react";
import ProjectionDeckMap from "./ProjectionDeckMap";
import Keystoner from "./Components/Keystoner";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { getCityIOUrl } from "../settings/settings";

const VALID_METRIC_CODES = new Set([
  "PTA",
  "RA",
  "A",
  "AN",
  "UH"
]);

function normalizeMetricCode(value) {
  if (value === undefined || value === null) return null;

  const code = String(value).trim().toUpperCase();

  return VALID_METRIC_CODES.has(code)
    ? code
    : null;
}

function readMetricCode(source) {
  if (!source || typeof source !== "object") {
    return null;
  }

  return (
    normalizeMetricCode(source.metricCode) ||
    normalizeMetricCode(source.metric_code) ||
    normalizeMetricCode(source.selectedMetric) ||
    normalizeMetricCode(source.selected_metric) ||
    normalizeMetricCode(source.layerID) ||
    normalizeMetricCode(source.layerId) ||
    normalizeMetricCode(source.layer_id) ||
    null
  );
}

function readMetricCodeFromCells(cells) {
  if (!Array.isArray(cells)) {
    return null;
  }

  for (const cell of cells) {
    const code =
      readMetricCode(cell) ||
      readMetricCode(cell?.properties);

    if (code) {
      return code;
    }
  }

  return null;
}

function readMetricCodeFromTableMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }

  const content = message.content;

  // GEOGRIDDATA_UPDATE may send the cell array directly.
  if (Array.isArray(content)) {
    return readMetricCodeFromCells(content);
  }

  if (!content || typeof content !== "object") {
    return null;
  }

  // Direct metric value from CityIO.
  const directCode = readMetricCode(content);

  if (directCode) {
    return directCode;
  }

  // Initial TABLE_SNAPSHOT.
  if (message.type === "TABLE_SNAPSHOT") {
    const snapshot = content.snapshot || content;

    return (
      readMetricCode(snapshot) ||
      readMetricCodeFromCells(snapshot.GEOGRIDDATA)
    );
  }

  // GEOGRIDDATA wrapped inside an object.
  return (
    readMetricCodeFromCells(content.GEOGRIDDATA) ||
    readMetricCodeFromCells(content.geogriddata) ||
    readMetricCodeFromCells(content.geogridData) ||
    null
  );
}

export default function ProjectionMapping(props) {
  const tableName = props.tableName;

  const [cityIOData, setCityIOData] = useState();
  const [selectedMetricCode, setSelectedMetricCode] = useState(null);

  const [editMode, setEditMode] = useState(false);
  const [viewStateEditMode, setViewStateEditMode] = useState(false);
  const [tableRatio, setTableRatio] = useState();

  const {
    readyState,
    sendJsonMessage,
    lastJsonMessage,
  } = useWebSocket(
    getCityIOUrl.current,
    {
      share: true,
      shouldReconnect: () => true,
    }
  );

  // -----------------------------------------------------------------------
  // Subscribe to CityIO
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (readyState !== ReadyState.OPEN) {
      return;
    }

    sendJsonMessage({
      type: "LISTEN",
      content: {
        gridId: tableName,
      },
    });
  }, [
    readyState,
    sendJsonMessage,
    tableName,
  ]);

  // -----------------------------------------------------------------------
  // Process CityIO messages
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!lastJsonMessage) {
      return;
    }

    const messageType =
      lastJsonMessage.type;

    const content =
      lastJsonMessage.content;

    // ===============================================================
    // TABLE SNAPSHOT
    // ===============================================================

    if (messageType === "TABLE_SNAPSHOT") {
      const snapshot =
        content?.snapshot ||
        content;

      if (!snapshot) {
        return;
      }

      const metricCode =
        readMetricCodeFromTableMessage(
          lastJsonMessage
        );

      if (metricCode) {
        setSelectedMetricCode(
          metricCode
        );

        console.log(
          "TABLE METRIC:",
          metricCode
        );
      }

      setCityIOData(
        (previous) => ({
          ...previous,
          ...snapshot,

          selectedMetricCode:
            metricCode ||
            previous?.selectedMetricCode ||
            null,
        })
      );

      const numCols =
        snapshot?.GEOGRID
          ?.properties
          ?.header
          ?.ncols;

      const numRows =
        snapshot?.GEOGRID
          ?.properties
          ?.header
          ?.nrows;

      if (
        Number(numCols) > 0 &&
        Number(numRows) > 0
      ) {
        setTableRatio(
          Number(numCols) /
          Number(numRows)
        );
      }

      return;
    }

    // ===============================================================
    // PHYSICAL TABLE UPDATE
    // ===============================================================

    if (
      messageType === "GEOGRIDDATA_UPDATE" ||
      messageType === "UPDATE_GRID"
    ) {
      const metricCode =
        readMetricCodeFromTableMessage(
          lastJsonMessage
        );

      if (metricCode) {
        setSelectedMetricCode(
          metricCode
        );

        console.log(
          "TABLE METRIC:",
          metricCode
        );
      }

      const contentObject =
        content &&
        typeof content === "object" &&
        !Array.isArray(content)
          ? content
          : {};

      const geogriddata =
        Array.isArray(content)
          ? content
          : contentObject.GEOGRIDDATA ||
            contentObject.geogriddata ||
            contentObject.geogridData ||
            null;

      setCityIOData(
        (previous) => ({
          ...previous,

          ...(Array.isArray(content)
            ? {}
            : contentObject),

          ...(geogriddata
            ? {
                GEOGRIDDATA:
                  geogriddata,
              }
            : {}),

          selectedMetricCode:
            metricCode ||
            previous?.selectedMetricCode ||
            null,
        })
      );

      return;
    }

    // ===============================================================
    // METRICS MODULE OUTPUT
    // ===============================================================

    if (messageType === "MODULE") {
      const moduleContent =
        content || {};

      const moduleData =
        moduleContent.moduleData ||
        {};

      /*
       * IMPORTANT:
       *
       * MODULE messages do NOT decide the selected metric.
       *
       * The physical table is the source of truth.
       *
       * MODULE only supplies the calculated projection layer
       * and numeric indicators.
       */

      setCityIOData(
        (previous) => ({
          ...previous,
          ...moduleContent,

          moduleData,

          MODULE:
            moduleContent,

          /*
           * table.py now sends exactly one selected projection layer.
           */
          LAYERS:
            Array.isArray(
              moduleData.layers
            )
              ? moduleData.layers
              : previous?.LAYERS || [],

          numeric:
            moduleData.numeric ||
            previous?.numeric ||
            [],

          selectedMetricCode:
            previous?.selectedMetricCode ||
            selectedMetricCode ||
            null,
        })
      );

      console.log(
        "MODULE LAYERS:",
        moduleData.layers || []
      );

      return;
    }

    // ===============================================================
    // ERROR
    // ===============================================================

    if (messageType === "ERROR") {
      console.error(
        "Error from CityIO",
        lastJsonMessage
      );
    }
  }, [
    lastJsonMessage,
    selectedMetricCode,
  ]);

  // -----------------------------------------------------------------------
  // Projection calibration
  // -----------------------------------------------------------------------

  const clearLocalStorage = () => {
    localStorage.removeItem(
      "projMap"
    );

    localStorage.removeItem(
      "projectionViewStateStorage"
    );

    window.location.reload();
  };

  useEffect(() => {
    const onKeyDown = ({
      key,
    }) => {
      if (key === " ") {
        setEditMode(
          (current) =>
            !current
        );
      }

      if (
        key.toLowerCase() === "z"
      ) {
        setViewStateEditMode(
          (current) =>
            !current
        );
      }
    };

    document.addEventListener(
      "keydown",
      onKeyDown
    );

    return () => {
      document.removeEventListener(
        "keydown",
        onKeyDown
      );
    };
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      {tableRatio && (
        <div
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

                backgroundColor:
                  editMode
                    ? "red"
                    : null,

                border:
                  editMode
                    ? "1px solid red"
                    : "1px solid white",
              }}
              isEditMode={
                editMode
              }
            >
              <ProjectionDeckMap
                viewStateEditMode={
                  viewStateEditMode
                }

                cityIOdata={
                  cityIOData
                }

                selectedLayerId={
                  selectedMetricCode
                }
              />
            </Keystoner>
          </div>
        </div>
      )}

      {editMode && (
        <div
          style={{
            position:
              "absolute",

            top:
              "50%",

            left:
              "50%",

            transform:
              "translate(-50%, -50%)",

            zIndex:
              1000,
          }}
        >
          <button
            onClick={
              clearLocalStorage
            }
          >
            Clear Local Storage
          </button>
        </div>
      )}
    </>
  );
}