/*

ProjectionDeckMap

Metric selection comes directly from the table codes:
UH, AN, A, RA, PTA.

Layer order:
1. basemap
2. selected metric
3. interactive grid mesh + labels

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
  {
    label: "PTA",
    name: "Public Transit Accessibility",
    layerId: "publicTransitAccessibility",
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
    label: "AN",
    name: "Access to Nature",
    layerId: "accessToNature",
  },
  {
    label: "UH",
    name: "Urban Heat",
    layerId: "urbanHeatH3",
  }
];


const METRIC_CODE_TO_LAYER_ID = {
  PTA: "publicTransitAccessibility",
  RA: "restaurantAccessibility",
  A: "accessibility",
  AN: "accessToNature",
  UH: "urbanHeatH3",
};


function metricLayerIdFromCode(code) {
  if (!code) {
    return null;
  }

  const normalized =
    String(code)
      .trim()
      .toUpperCase();

  return (
    METRIC_CODE_TO_LAYER_ID[
      normalized
    ] || null
  );
}


function readHeightValue(cell) {
  if (!cell) {
    return 0;
  }

  const rawHeight =
    cell.height ??
    cell.building_height ??
    cell.buildingHeight ??
    cell.slider_height ??
    cell.height_slider ??
    cell.heightSlider ??
    0;

  if (Array.isArray(rawHeight)) {
    if (rawHeight.length >= 2) {
      const value =
        Number(rawHeight[1]);

      return Number.isNaN(value)
        ? 0
        : value;
    }

    if (rawHeight.length === 1) {
      const value =
        Number(rawHeight[0]);

      return Number.isNaN(value)
        ? 0
        : value;
    }

    return 0;
  }

  const value =
    Number(rawHeight);

  return Number.isNaN(value)
    ? 0
    : value;
}


function parseColorValue(
  rawColor
) {
  if (Array.isArray(rawColor)) {
    return [
      Number(rawColor[0]) || 0,
      Number(rawColor[1]) || 0,
      Number(rawColor[2]) || 0,
    ];
  }

  if (
    rawColor &&
    typeof rawColor === "object"
  ) {
    const nestedColor =
      rawColor.rgb ||
      rawColor.rgba ||
      rawColor.color ||
      rawColor.color_rgb ||
      rawColor.fillColor ||
      rawColor.fill_color_rgb;

    if (
      nestedColor &&
      nestedColor !== rawColor
    ) {
      const parsed =
        parseColorValue(
          nestedColor
        );

      if (parsed) {
        return parsed;
      }
    }

    const r =
      rawColor.r ??
      rawColor.red ??
      rawColor[0];

    const g =
      rawColor.g ??
      rawColor.green ??
      rawColor[1];

    const b =
      rawColor.b ??
      rawColor.blue ??
      rawColor[2];

    if (
      r !== undefined &&
      g !== undefined &&
      b !== undefined
    ) {
      return [
        Number(r) || 0,
        Number(g) || 0,
        Number(b) || 0,
      ];
    }
  }

  if (
    typeof rawColor === "string"
  ) {
    const trimmed =
      rawColor.trim();

    if (
      trimmed.startsWith("#")
    ) {
      const hex =
        trimmed.replace(
          "#",
          ""
        );

      if (hex.length === 3) {
        return hex
          .split("")
          .map(
            (value) =>
              parseInt(
                value + value,
                16
              )
          );
      }

      if (hex.length >= 6) {
        return [
          parseInt(
            hex.slice(0, 2),
            16
          ),
          parseInt(
            hex.slice(2, 4),
            16
          ),
          parseInt(
            hex.slice(4, 6),
            16
          ),
        ];
      }
    }

    const numbers =
      trimmed.match(
        /\d+(\.\d+)?/g
      );

    if (
      numbers &&
      numbers.length >= 3
    ) {
      return [
        Number(numbers[0]) || 0,
        Number(numbers[1]) || 0,
        Number(numbers[2]) || 0,
      ];
    }
  }

  return null;
}


function isBlackColor(color) {
  return (
    Array.isArray(color) &&
    color[0] === 0 &&
    color[1] === 0 &&
    color[2] === 0
  );
}


function findSensorBlockCell(
  geogridData
) {
  if (
    !Array.isArray(
      geogridData
    )
  ) {
    return null;
  }

  return (
    geogridData.find(
      (cell) =>
        String(cell?.id) ===
        "99"
    ) ||
    geogridData.find(
      (cell) =>
        String(
          cell?.grid_id
        ) === "99"
    ) ||
    geogridData.find(
      (cell) =>
        String(
          cell?.cell_id
        ) === "99"
    ) ||
    null
  );
}


function getCellDisplayName(
  cell
) {
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


function getRawCellColor(
  cell
) {
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


function findMatchingPieceColor(
  sensorBlockCell,
  geogridData
) {
  if (
    !sensorBlockCell ||
    !Array.isArray(
      geogridData
    )
  ) {
    return null;
  }

  const sensorLabel =
    String(
      getCellDisplayName(
        sensorBlockCell
      )
    )
      .trim()
      .toLowerCase();

  if (
    !sensorLabel ||
    sensorLabel ===
      "sensor block"
  ) {
    return null;
  }

  for (
    const cell
    of geogridData
  ) {
    if (
      !cell ||
      cell === sensorBlockCell ||
      String(cell.id) === "99"
    ) {
      continue;
    }

    const label =
      String(
        getCellDisplayName(
          cell
        )
      )
        .trim()
        .toLowerCase();

    if (
      label !== sensorLabel
    ) {
      continue;
    }

    const parsedColor =
      parseColorValue(
        getRawCellColor(
          cell
        )
      );

    if (
      parsedColor &&
      !isBlackColor(
        parsedColor
      )
    ) {
      return parsedColor;
    }
  }

  return null;
}


function getCellDisplayColor(
  cell,
  geogridData
) {
  const directColor =
    parseColorValue(
      getRawCellColor(
        cell
      )
    );

  const matchingPieceColor =
    findMatchingPieceColor(
      cell,
      geogridData
    );

  if (
    matchingPieceColor &&
    (
      !directColor ||
      isBlackColor(
        directColor
      )
    )
  ) {
    return matchingPieceColor;
  }

  return (
    directColor ||
    matchingPieceColor ||
    [255, 255, 255]
  );
}


function getActiveBuildingInfo(
  cityIOdata
) {
  const geogridData =
    cityIOdata?.GEOGRIDDATA;

  if (
    !Array.isArray(
      geogridData
    )
  ) {
    return {
      height: 0,
      color: [
        255,
        255,
        255,
      ],
      name:
        "Sensor block",
    };
  }

  const sensorBlockCell =
    findSensorBlockCell(
      geogridData
    );

  if (sensorBlockCell) {
    return {
      height:
        readHeightValue(
          sensorBlockCell
        ),

      color:
        getCellDisplayColor(
          sensorBlockCell,
          geogridData
        ),

      name:
        getCellDisplayName(
          sensorBlockCell
        ),
    };
  }

  return {
    height: 0,

    color: [
      255,
      255,
      255,
    ],

    name:
      "Sensor block 99 not found",
  };
}


function ControlsBackground() {
  return (
    <div
      style={{
        position:
          "fixed",

        zIndex:
          10,

        left:
          1140,

        top:
          650,

        width:
          460,

        height:
          270,

        backgroundColor:
          "black",

        pointerEvents:
          "none",
      }}
    />
  );
}


function ProjectionLegend({
  selectedMetricCode,
  cityIOdata,
}) {
  const activeBuilding =
    getActiveBuildingInfo(
      cityIOdata
    );

  const activeHeight =
    activeBuilding.height;

  const activeColor =
    activeBuilding.color;

  const activeName =
    activeBuilding.name;

  const heightRatio =
    Math.max(
      0,
      Math.min(
        1,
        activeHeight / 10
      )
    );

  const projectedBuildingHeight =
    heightRatio * 140;

  return (
    <div
      style={{
        position:
          "fixed",

        zIndex:
          20,

        left:
          1240,

        top:
          660,

        color:
          "white",

        fontFamily:
          "sans-serif, helvetica, arial",

        fontWeight:
          "900",

        pointerEvents:
          "none",

        textShadow:
          "0 0 4px black, 0 0 8px black, 0 0 12px black",
      }}
    >
      <div
        style={{
          position:
            "relative",

          width:
            360,

          height:
            230,

          fontSize:
            14,
        }}
      >
        <div
          style={{
            position:
              "absolute",

            left:
              -80,

            bottom:
              75,

            width:
              24,

            height:
              projectedBuildingHeight,

            backgroundColor:
              `rgba(${activeColor[0]}, ${activeColor[1]}, ${activeColor[2]}, 0.95)`,

            border:
              "2px solid white",

            boxShadow:
              `0 0 8px rgba(${activeColor[0]}, ${activeColor[1]}, ${activeColor[2]}, 0.95), 0 0 10px black`,

            transformOrigin:
              "bottom center",
          }}
        />

        <div
          style={{
            position:
              "absolute",

            left:
              78,

            top:
              65,

            width:
              50,

            height:
              50,

            backgroundColor:
              `rgba(${activeColor[0]}, ${activeColor[1]}, ${activeColor[2]}, 0.85)`,

            border:
              "2px solid rgba(255, 255, 255, 0.4)",

            boxShadow:
              `0 0 15px rgba(${activeColor[0]}, ${activeColor[1]}, ${activeColor[2]}, 0.6)`,

            borderRadius:
              "2px",
          }}
        />

        <div
          style={{
            position:
              "absolute",

            left:
              42,

            top:
              125,

            width:
              100,

            textAlign:
              "center",

            fontSize:
              9,

            color:
              "rgba(255, 255, 255, 0.85)",

            fontWeight:
              "700",
          }}
        >
          {activeName}
        </div>

        <div
          style={{
            position:
              "absolute",

            left:
              -35,

            top:
              170,
          }}
        >
          HEIGHT
        </div>

        <div
          style={{
            position:
              "absolute",

            left:
              150,

            top:
              170,
          }}
        >
          METRIC
        </div>

        <div
          style={{
            position:
              "absolute",

            left:
              240,

            top:
              10,

            lineHeight:
              "32px",
          }}
        >
          {METRIC_OPTIONS.map(
            (option) => (
              <div
                key={
                  option.label
                }

                style={{
                  color:
                    option.label ===
                    selectedMetricCode
                      ? "rgb(255, 70, 70)"
                      : "white",

                  fontWeight:
                    option.label ===
                    selectedMetricCode
                      ? "900"
                      : "700",
                }}
              >
                {
                  option.label
                }
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}


export default function ProjectionDeckMap(
  props
) {
  const [
    layersToRender,
    setLayersToRender,
  ] = useState([]);

  const [
    layerInfo,
    setLayerInfo,
  ] = useState(null);

  const cityIOdata =
    props.cityIOdata;

  const viewStateEditMode =
    props.viewStateEditMode;

  const selectedMetricCode =
    props.selectedLayerId
      ? String(
          props.selectedLayerId
        )
          .trim()
          .toUpperCase()
      : null;

  const selectedLayerId =
    metricLayerIdFromCode(
      selectedMetricCode
    );

  const GEOGRID =
    cityIOdata?.GEOGRID;


  // -----------------------------------------------------------------------
  // Backend now sends exactly one selected layer.
  // -----------------------------------------------------------------------

  function getProjectionLayers() {
    const layers =
      cityIOdata?.LAYERS;

    if (
      Array.isArray(layers) &&
      layers.length > 0
    ) {
      return layers;
    }

    const moduleLayers =
      cityIOdata
        ?.moduleData
        ?.layers;

    if (
      Array.isArray(
        moduleLayers
      ) &&
      moduleLayers.length > 0
    ) {
      return moduleLayers;
    }

    return [];
  }


  function pushGridOnTop(
    layerArray
  ) {
    if (
      !cityIOdata ||
      !GEOGRID
    ) {
      return;
    }

    const gridLayers =
      createMeshLayer(
        cityIOdata,
        GEOGRID,
        OBJLoader
      );

    if (
      Array.isArray(
        gridLayers
      )
    ) {
      layerArray.push(
        ...gridLayers
      );
    } else if (
      gridLayers
    ) {
      layerArray.push(
        gridLayers
      );
    }
  }


  function createDeckLayer(
    layerIndex,
    layer
  ) {
    if (
      !GEOGRID ||
      !layer
    ) {
      return null;
    }

    const layerType =
      layer.type;

    if (
      layerType === "heatmap"
    ) {
      return createHeatmapLayer(
        layerIndex,
        layer,
        GEOGRID
      );
    }

    if (
      layerType === "arc"
    ) {
      return createArcLayer(
        layerIndex,
        layer,
        GEOGRID
      );
    }

    if (
      layerType === "geojson" ||
      layerType ===
        "geojsonbase"
    ) {
      return createGeoJsonLayer(
        layerIndex,
        layer,
        GEOGRID
      );
    }

    if (
      layerType === "path"
    ) {
      return createPathLayer(
        layerIndex,
        layer,
        GEOGRID
      );
    }

    if (
      layerType ===
      "h3cluster"
    ) {
      return createH3ClusterLayer(
        layerIndex,
        layer,
        GEOGRID
      );
    }

    console.error(
      "Layer type not supported:",
      layerType,
      layer
    );

    return null;
  }


  useEffect(() => {
    if (
      !cityIOdata ||
      !GEOGRID
    ) {
      setLayersToRender(
        []
      );

      setLayerInfo(
        null
      );

      return;
    }

    // Basemap is always first.
    const layerArray = [
      createTileLayer(),
    ];

    const metricLayers =
      getProjectionLayers();

    if (
      !selectedMetricCode
    ) {
      setLayerInfo(
        "No metric selected"
      );

      pushGridOnTop(
        layerArray
      );

      setLayersToRender(
        layerArray
      );

      return;
    }

    if (
      !selectedLayerId
    ) {
      setLayerInfo(
        `Unknown metric ${selectedMetricCode}`
      );

      pushGridOnTop(
        layerArray
      );

      setLayersToRender(
        layerArray
      );

      return;
    }

    /*
     * table.py should already have filtered the output
     * to exactly one layer.
     *
     * We still verify its ID so a stale MODULE message
     * cannot display the wrong metric.
     */

    const metricLayer =
      metricLayers.find(
        (layer) =>
          layer?.id ===
          selectedLayerId
      );

    console.log(
      "PROJECTION METRIC:",
      selectedMetricCode,
      "->",
      selectedLayerId
    );

    console.log(
      "RECEIVED LAYERS:",
      metricLayers.map(
        (layer) =>
          layer?.id
      )
    );

    if (!metricLayer) {
      setLayerInfo(
        `Waiting for ${selectedLayerId}`
      );

      pushGridOnTop(
        layerArray
      );

      setLayersToRender(
        layerArray
      );

      return;
    }

    const deckLayer =
      createDeckLayer(
        0,
        metricLayer
      );

    if (deckLayer) {
      layerArray.push(
        deckLayer
      );
    }

    // Interactive grid ALWAYS last / on top.
    pushGridOnTop(
      layerArray
    );

    setLayerInfo(
      metricLayer.id
    );

    setLayersToRender(
      layerArray
    );
  }, [
    cityIOdata,
    GEOGRID,
    selectedMetricCode,
    selectedLayerId,
  ]);


  if (
    !cityIOdata ||
    !GEOGRID
  ) {
    return null;
  }


  return (
    <>
      {layerInfo && (
        <div
          style={{
            position:
              "absolute",

            zIndex:
              4,

            bottom:
              0,

            left:
              0,

            paddingLeft:
              10,

            paddingRight:
              10,

            margin:
              10,

            color:
              "white",

            backgroundColor:
              "rgba(0, 0, 0, 0.5)",

            borderRadius:
              5,

            fontFamily:
              "sans-serif, helvetica, arial",
          }}
        >
          <h3>
            {layerInfo}
          </h3>
        </div>
      )}

      <ControlsBackground />

      <ProjectionLegend
        selectedMetricCode={
          selectedMetricCode
        }

        cityIOdata={
          cityIOdata
        }
      />

      <DeckMap
        header={
          cityIOdata
            .GEOGRID
            .properties
            .header
        }

        viewStateEditMode={
          viewStateEditMode
        }

        layersArray={
          layersToRender
        }
      />
    </>
  );
}
