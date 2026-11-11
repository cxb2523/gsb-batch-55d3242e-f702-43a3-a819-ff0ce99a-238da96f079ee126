// UNSTOPPABLE-MOTION. A panel that slides in on every state change, with no way to turn it off.
// For someone with a vestibular disorder that is nausea, and the OS setting is the only way they
// can say so. 37 of 378 corpus cards move something; 7 of the 131 that animate honour the switch.
export default function Slider() {
  return (
    <div style={{ color: "var(--dsw-alias-label-primary)" }}>
      <style>{`
        @keyframes slide-in { from { transform: translateX(40px); opacity: 0 } to { transform: none; opacity: 1 } }
        .panel { animation: slide-in 240ms ease-out; transition: transform 200ms ease }
        .panel:hover { transform: scale(1.03) }
      `}</style>
      <div className="panel">滑入的面板</div>
    </div>
  );
}
