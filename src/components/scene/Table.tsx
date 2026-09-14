"use client";

export const TABLE_RADIUS = 1.8;
export const TABLE_TOP_Y = 0;
const TOP_THICKNESS = 0.08;
const TABLE_HEIGHT = 1.1;

export default function Table() {
  const floorY = TABLE_TOP_Y - TABLE_HEIGHT;

  return (
    <group>
      {/* Ploča stola */}
      <mesh position={[0, TABLE_TOP_Y - TOP_THICKNESS / 2, 0]}>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, TOP_THICKNESS, 64]} />
        <meshStandardMaterial color="#5a3520" roughness={0.55} metalness={0.05} />
      </mesh>

      {/* Stolnjak — tanki disk malo iznad ploče */}
      <mesh position={[0, TABLE_TOP_Y + 0.001, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[TABLE_RADIUS * 0.55, 64]} />
        <meshStandardMaterial color="#d9ccb8" roughness={0.9} />
      </mesh>

      {/* Noga */}
      <mesh position={[0, (TABLE_TOP_Y - TOP_THICKNESS + floorY) / 2, 0]}>
        <cylinderGeometry args={[0.12, 0.18, TABLE_HEIGHT - TOP_THICKNESS, 24]} />
        <meshStandardMaterial color="#4a2c1a" roughness={0.6} />
      </mesh>
      <mesh position={[0, floorY + 0.03, 0]}>
        <cylinderGeometry args={[0.55, 0.6, 0.06, 32]} />
        <meshStandardMaterial color="#4a2c1a" roughness={0.6} />
      </mesh>

      {/* Pod */}
      <mesh position={[0, floorY, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[12, 48]} />
        <meshStandardMaterial color="#2a1d15" roughness={1} />
      </mesh>
    </group>
  );
}
