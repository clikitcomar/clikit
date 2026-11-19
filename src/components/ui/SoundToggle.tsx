"use client";

import { useSyncExternalStore } from "react";

import { isSoundEnabled, toggleSound } from "@/lib/audio";
import { LEGACY_SOUND_TOGGLE_EVENT, SOUND_TOGGLE_EVENT } from "@/lib/brand";

function subscribeToSound(onStoreChange: () => void) {
  window.addEventListener(SOUND_TOGGLE_EVENT, onStoreChange);
  window.addEventListener(LEGACY_SOUND_TOGGLE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener(SOUND_TOGGLE_EVENT, onStoreChange);
    window.removeEventListener(LEGACY_SOUND_TOGGLE_EVENT, onStoreChange);
  };
}

const getSoundSnapshot = () => isSoundEnabled();
const getSoundServerSnapshot = () => true;

export default function SoundToggle() {
  const enabled = useSyncExternalStore(
    subscribeToSound,
    getSoundSnapshot,
    getSoundServerSnapshot
  );

  const handleClick = () => {
    toggleSound();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="app-header-icon-link app-header-icon-button"
      title={enabled ? "Desactivar sonido" : "Activar sonido"}
      aria-label={enabled ? "Desactivar sonido" : "Activar sonido"}
      style={{
        opacity: enabled ? 1 : 0.5,
        transition: "opacity 0.2s",
      }}
    >
      {enabled ? "\uD83D\uDD0A" : "\uD83D\uDD07"}
    </button>
  );
}
