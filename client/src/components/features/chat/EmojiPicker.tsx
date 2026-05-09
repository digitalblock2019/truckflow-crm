"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  align?: "left" | "right"; // which edge to anchor — "right" expands the picker leftward
}

// emoji-mart's full picker is roughly 425px tall; flip downward if the trigger
// is close enough to the viewport top that opening upward would clip.
const PICKER_HEIGHT_ESTIMATE = 450;

export default function EmojiPicker({ onSelect, onClose, align = "left" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [openUpward, setOpenUpward] = useState(true);

  useLayoutEffect(() => {
    const trigger = ref.current?.parentElement;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    if (rect.top < PICKER_HEIGHT_ESTIMATE) setOpenUpward(false);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute z-50 ${openUpward ? "bottom-full mb-2" : "top-full mt-2"} ${align === "right" ? "right-0" : "left-0"}`}
    >
      <Picker
        data={data}
        onEmojiSelect={(emoji: any) => onSelect(emoji.native)}
        theme="light"
        previewPosition="none"
        skinTonePosition="none"
        maxFrequentRows={2}
      />
    </div>
  );
}
