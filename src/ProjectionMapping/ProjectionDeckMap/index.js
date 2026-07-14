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
  createPath