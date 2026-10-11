import { useEffect, useMemo, useRef, useState } from "react";
import { AREA_LIST, AREAS, type AreaId } from "./data/areas";
import { CityApp } from "./engine/CityApp";
import type { CityData, InspectInfo } from "./engine/types";

function parseArea(): AreaId {
  const q = new URLSearchParams(location.search).get("area");
  if (q && q in AREAS) return q as AreaId;
  try {
    const saved = localStorage.getItem("procedural-douala:area");
    if (saved && saved in AREAS) return saved as AreaId;
  } catch {
    /* ignore */
  }
  return "akwa";
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const appRef = useRef<CityApp | null>(null);
  const area = useMemo(parseArea, []);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("starting…");
  const [ready, setReady] = useState(false);
  const [city, setCity] = useState<CityData | null>(null);
  const [abstract, setAbstract] = useState(false);
  const [inspect, setInspect] = useState<InspectInfo | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("procedural-douala:area", area);
    } catch {
      /* ignore */
    }
    if (!host.current) return;
    const app = new CityApp(host.current, area, {
      onProgress: (p, s) => {
        setProgress(p);
        setStep(s);
      },
      onReady: (c) => {
        setCity(c);
        setReady(true);
        setAbstract(app.settings.abstract);
      },
      onInspect: setInspect,
    });
    appRef.current = app;
    return () => app.dispose();
  }, [area]);

  return (
    <>
      <div className="stage" ref={host} />
      <div className={`loader ${ready ? "done" : ""}`}>
        <div className="eyebrow">Cameroun</div>
        <div className="city">{AREAS[area].name}</div>
        <div className="bar">
          <div className="fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="step">{step}</div>
      </div>
      {city && (
        <aside className="hud">
          {city.name}
          {"\n"}
          {city.subtitle}
          {"\n"}
          {city.counts.buildings} buildings
          {"\n"}
          {city.counts.roads} roads
          {"\n"}
          drag pan · right-drag orbit · wheel zoom
          {"\n"}
          WASD fly · N night · click inspect
        </aside>
      )}
      {inspect && (
        <aside className="inspect">
          <strong>{inspect.name}</strong>
          {"\n"}
          {inspect.use}
          {"\n"}
          {inspect.height} m · {inspect.levels} levels
        </aside>
      )}
      <button
        className={`mode ${abstract ? "abstract" : "photo"}`}
        title="Switch between the photoreal city and the abstract model"
        onClick={() => {
          appRef.current?.toggleMode();
          setAbstract((v) => !v);
        }}
      />
      <nav className="areas">
        {AREA_LIST.map((a) => (
          <a key={a.id} href={`?area=${a.id}`} className={a.id === area ? "on" : ""}>
            {a.name}
          </a>
        ))}
      </nav>
      <a className="credits" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        OpenStreetMap · Douala
      </a>
    </>
  );
}
