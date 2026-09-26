"use client";

import { useEffect, useState } from "react";
import { shouldShowFloatingPasteButton } from "@/lib/validacao-de-imagem-da-galeria";

export function BotaoFlutuanteDeColarImagemNoCelularETablet({
  hidden,
  disabled,
  onPaste,
}: {
  hidden: boolean;
  disabled: boolean;
  onPaste: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const update = () => {
      setVisible(shouldShowFloatingPasteButton({ coarsePointer: coarse.matches }));
    };
    update();
    coarse.addEventListener("change", update);
    return () => coarse.removeEventListener("change", update);
  }, []);

  if (hidden || !visible) return null;

  return (
    <button
      type="button"
      className="fixed right-4 z-30 rounded-full bg-[#d6ff3f] px-4 py-3 text-sm font-semibold text-black shadow-lg disabled:opacity-40"
      style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      disabled={disabled}
      onClick={onPaste}
    >
      Colar
    </button>
  );
}
