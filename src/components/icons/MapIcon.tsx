"use client";

import Image from "next/image";
import * as React from "react";

export function MapIcon(props: any) {
  return (
    <div style={{ width: props.size || 24, height: props.size || 24, position: "relative", filter: props.color ? `drop-shadow(0 0 0 ${props.color})` : "none" }}>
      <Image src="/map.png" alt="Map" fill className="object-contain" />
    </div>
  );
}
