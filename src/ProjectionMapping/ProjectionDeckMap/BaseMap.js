import { useEffect, useState } from "react";
import DeckGL from "@deck.gl/react";
import ViewStateInputs from "../Components/ViewStateInputs";
import "mapbox-gl/dist/mapbox-gl.css";

function cloneDeckLayer(layer) {
  if (!layer) return null;

  if (typeof layer.clone === "function") {
    return layer.clone({ id: layer.id });
  }

  return layer;
}

export default function BaseMap(props) {
  const header = props.header;
  const viewStateEditMode = props.viewStateEditMode;
  const layersArray = Array.isArray(props.layersArray)
    ? props.layersArray.filter(Boolean).map(cloneDeckLayer).filter(Boolean)
    : [];

  const [viewState, setViewState] = useState(() => {
    if (localStorage.getItem("projectionViewStateStorage")) {
      const vs = localStorage.getItem("projectionViewStateStorage");
      console.log("loading saved projection View State from Storage...", vs);
      return JSON.parse(vs);
    } else {
      return {
        latitude: header.latitude,
        longitude: header.longitude,
        zoom: 15,
        pitch: 0,
        bearing: 360 - header.rotation || 0,
        orthographic: true,
      };
    }
  });

  useEffect(() => {
    const wrapper = document.getElementById("deckgl-wrapper");
    if (wrapper) {
      wrapper.addEventListener("contextmenu", (evt) => evt.preventDefault());
    }

    return () => {
      if (wrapper) {
        wrapper.removeEventListener("contextmenu", (evt) => evt.preventDefault());
      }
    };
  }, []);

  const onViewStateChange = ({ viewState }) => {
    localStorage.setItem(
      "projectionViewStateStorage",
      JSON.stringify(viewState)
    );

    setViewState({
      ...viewState,
      pitch: 0,
      orthographic: true,
    });
  };

  return (
    <div
      id="projection-map-wrapper"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "black",
        zIndex: 0,
      }}
    >
      <DeckGL
        id="deckgl-wrapper"
        controller={true}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        layers={layersArray}
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
        }}
      />

      {viewState && viewStateEditMode && (
        <ViewStateInputs setViewState={setViewState} viewState={viewState} />
      )}
    </div>
  );
}
