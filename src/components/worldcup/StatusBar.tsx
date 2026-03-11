import { Wifi, Battery, Signal } from "lucide-react";

const StatusBar = () => (
  <div className="flex items-center justify-between px-5 py-1.5 bg-wc-bg text-wc-text text-xs font-semibold">
    <span>9:41</span>
    <div className="flex items-center gap-1">
      <Signal size={14} />
      <Wifi size={14} />
      <Battery size={14} />
    </div>
  </div>
);

export default StatusBar;
