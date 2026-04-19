import { useEffect, useState } from "react";

export function StatusBar() {
  const [time, setTime] = useState("9:41");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const display = `${hours === 0 ? 12 : hours > 12 ? hours - 12 : hours}:${String(minutes).padStart(2, "0")}`;
      setTime(display);
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex justify-between items-center px-6 pt-3 pb-1 text-sm font-bold text-ink">
      <span>{time}</span>
      <span className="flex items-center gap-1.5 text-xs">
        <span className="inline-flex gap-[2px]">
          <span className="w-[3px] h-[4px] bg-ink rounded-sm" />
          <span className="w-[3px] h-[6px] bg-ink rounded-sm" />
          <span className="w-[3px] h-[8px] bg-ink rounded-sm" />
          <span className="w-[3px] h-[10px] bg-ink rounded-sm" />
        </span>
        <span className="font-bold text-xs">5G</span>
        <span className="inline-flex items-center px-1.5 py-[1px] bg-ink text-white text-[10px] rounded-[3px] font-bold">
          82
        </span>
      </span>
    </div>
  );
}
