export type Vec2 = [number, number];

export type Building = {
  id: number;
  ring: Vec2[];
  height: number;
  use: string;
  name: string;
  levels: number;
};

export type Road = {
  id: number;
  pts: Vec2[];
  width: number;
  kind: string;
  oneway: boolean;
  bridge: boolean;
  tunnel: boolean;
  name: string;
};

export type WaterPoly = { ring?: Vec2[]; pts?: Vec2[]; kind: string; width?: number };
export type Park = { ring: Vec2[]; kind: string };
export type Tree = { x: number; z: number; r: number };

export type CityData = {
  id: string;
  name: string;
  subtitle: string;
  origin: { lat: number; lon: number };
  bounds: { width: number; depth: number };
  view: { x: number; y: number; z: number; az: number; el: number };
  counts: Record<string, number>;
  buildings: Building[];
  roads: Road[];
  rails: { pts: Vec2[]; kind: string }[];
  water: WaterPoly[];
  parks: Park[];
  trees: Tree[];
  signals: { x: number; z: number }[];
  wouriHint: { plane: Vec2[]; districts: boolean };
};

export type EngineSettings = {
  hour: number;
  liveClock: boolean;
  traffic: boolean;
  cars: number;
  birds: number;
  clouds: number;
  quality: "high" | "med" | "low";
  abstract: boolean;
  wholeCity: boolean;
};

export type InspectInfo = {
  name: string;
  use: string;
  height: number;
  levels: number;
};
