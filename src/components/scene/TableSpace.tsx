"use client";

import { forwardRef, useImperativeHandle, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { MathUtils, type Group } from "three";
import { angleDelta } from "@/lib/party/geometry";

/**
 * Grupa u kojoj žive gosti i čaše (koordinate stola). Zarotirana je tako da je
 * "moj" gost najbliže kameri; kad se raspored promijeni, rotacija klizi glatko.
 */
const TableSpace = forwardRef<Group, { rotation: number; children: ReactNode }>(function TableSpace(
  { rotation, children },
  ref,
) {
  const groupRef = useRef<Group>(null!);
  useImperativeHandle(ref, () => groupRef.current);

  useFrame((_, delta) => {
    const g = groupRef.current;
    const diff = angleDelta(g.rotation.y, rotation);
    if (Math.abs(diff) < 0.0005) return;
    g.rotation.y = MathUtils.damp(g.rotation.y, g.rotation.y + diff, 4, delta);
  });

  return (
    <group ref={groupRef} rotation-y={rotation}>
      {children}
    </group>
  );
});

export default TableSpace;
