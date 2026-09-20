import React from 'react';

interface WaterTankProps {
  level: number; // 0 to 100
  isMotorOn: boolean;
  onToggleMotor: (e?: React.MouseEvent) => void;
  deviceName: string;
}

export const WaterTank: React.FC<WaterTankProps> = ({ level, isMotorOn, onToggleMotor, deviceName }) => {
  // Ensure level is clamped between 0 and 100
  const clampedLevel = Math.max(0, Math.min(100, level));

  return (
    <div className="flex flex-col items-center p-4 bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="w-full flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-800">{deviceName}</h3>
        <span className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-700 rounded-full">
          {clampedLevel}% Full
        </span>
      </div>

      <div className="relative w-32 h-48 border-4 border-slate-300 rounded-t-none rounded-b-xl overflow-hidden bg-slate-50 flex items-end shadow-inner mb-6">
        {/* Fill level */}
        <div 
          className="w-full bg-blue-500 transition-all duration-1000 ease-in-out relative"
          style={{ height: `${clampedLevel}%` }}
        >
          {/* Waves animation effect */}
          {clampedLevel > 0 && clampedLevel < 100 && (
            <div className="absolute -top-3 left-0 w-[200%] h-4 bg-blue-500 opacity-50 rounded-[50%] animate-[wave_2s_ease-in-out_infinite_alternate] mix-blend-multiply" style={{ transform: 'translateX(-25%)' }}></div>
          )}
        </div>
        
        {/* Tick marks */}
        <div className="absolute inset-y-0 left-0 w-full flex flex-col justify-between py-2 pointer-events-none opacity-30">
          <div className="border-b-2 border-slate-400 w-4 ml-1"></div>
          <div className="border-b-2 border-slate-400 w-4 ml-1"></div>
          <div className="border-b-2 border-slate-400 w-4 ml-1"></div>
          <div className="border-b-2 border-slate-400 w-4 ml-1"></div>
          <div className="border-b-2 border-slate-400 w-4 ml-1"></div>
        </div>
      </div>

      <div className="w-full flex justify-between items-center bg-slate-50 p-3 rounded-lg border">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isMotorOn ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
          <span className="text-sm font-medium text-gray-700">Pump: {isMotorOn ? 'Running' : 'Stopped'}</span>
        </div>
        <button 
          onClick={onToggleMotor}
          className={`px-4 py-1.5 rounded-md text-sm font-semibold text-white transition-colors ${isMotorOn ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
        >
          {isMotorOn ? 'Stop' : 'Start'}
        </button>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes wave {
          0% { transform: translateX(-10%); }
          100% { transform: translateX(-40%); }
        }
      `}} />
    </div>
  );
};
