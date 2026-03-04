"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Calculator, ArrowLeftRight, ArrowRightLeft } from "lucide-react";

interface PlateCalculatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultUnit?: string;
}

// Available plates in kg
const PLATES_KG = [25, 20, 15, 10, 5, 2.5];
// Available plates in lbs - removed 5
const PLATES_LBS = [45, 35, 25, 15, 10];

// Conversion constants
const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 0.453592;

export function PlateCalculator({
  open,
  onOpenChange,
  defaultUnit = "kg",
}: PlateCalculatorProps) {
  const [targetWeight, setTargetWeight] = useState<string>("");
  const [barWeight, setBarWeight] = useState<string>(
    defaultUnit === "kg" ? "20" : "45",
  );
  const [unit, setUnit] = useState(defaultUnit);
  const [showConversion, setShowConversion] = useState(false);
  const [conversionInput, setConversionInput] = useState<string>("");
  const [conversionFromUnit, setConversionFromUnit] = useState<"kg" | "lbs">(
    "kg",
  );

  const availablePlates = unit === "kg" ? PLATES_KG : PLATES_LBS;

  const platesNeeded = useMemo(() => {
    const target = parseFloat(targetWeight) || 0;
    const bar = parseFloat(barWeight) || 0;
    if (target <= bar) return [];

    const weightPerSide = (target - bar) / 2;
    const plates: number[] = [];
    let remaining = weightPerSide;

    for (const plate of availablePlates) {
      while (remaining >= plate) {
        plates.push(plate);
        remaining -= plate;
      }
    }

    return plates;
  }, [targetWeight, barWeight, availablePlates]);

  // Group plates by weight for cleaner display
  const platesGrouped = useMemo(() => {
    const grouped: { [key: number]: number } = {};
    platesNeeded.forEach((plate) => {
      grouped[plate] = (grouped[plate] || 0) + 1;
    });
    return grouped;
  }, [platesNeeded]);

  // Create display string for plates (e.g., "2×20 + 1×10")
  const platesDisplay = useMemo(() => {
    if (platesNeeded.length === 0) return "Ninguno";
    const parts: string[] = [];
    Object.entries(platesGrouped)
      .sort(([a], [b]) => Number(b) - Number(a))
      .forEach(([plate, count]) => {
        if (count === 1) {
          parts.push(`${plate} ${unit}`);
        } else {
          parts.push(`${count}×${plate} ${unit}`);
        }
      });
    return parts.join(" + ");
  }, [platesGrouped, platesNeeded.length, unit]);

  const totalWeight = useMemo(() => {
    const platesTotal = platesNeeded.reduce((sum, p) => sum + p, 0) * 2;
    return (parseFloat(barWeight) || 0) + platesTotal;
  }, [platesNeeded, barWeight]);

  const handleTargetChange = (value: string) => {
    // Allow empty values
    setTargetWeight(value);
  };

  const handleBarWeightChange = (value: string) => {
    // Allow empty values
    setBarWeight(value);
  };

  const handleUnitChange = (newUnit: string) => {
    setUnit(newUnit);
    setBarWeight(newUnit === "kg" ? "20" : "45");
    setTargetWeight("");
  };

  const conversionResult = useMemo(() => {
    const num = parseFloat(conversionInput);
    if (isNaN(num) || conversionInput === "") return null;
    if (conversionFromUnit === "kg") {
      return `${(num * KG_TO_LBS).toFixed(2)} lbs`;
    }
    return `${(num * LBS_TO_KG).toFixed(2)} kg`;
  }, [conversionInput, conversionFromUnit]);

  // Toggle conversion direction
  const toggleConversionDirection = () => {
    setConversionFromUnit((prev) => (prev === "kg" ? "lbs" : "kg"));
    setConversionInput("");
  };

  // Create unique plates for visualization (expanded)
  const platesForVisualization = useMemo(() => {
    const result: number[] = [];
    Object.entries(platesGrouped).forEach(([plate, count]) => {
      for (let i = 0; i < count; i++) {
        result.push(Number(plate));
      }
    });
    return result.sort((a, b) => b - a);
  }, [platesGrouped]);

  // Conversion label
  const conversionLabel =
    conversionFromUnit === "kg" ? "Convertir kg → lbs" : "Convertir lbs → kg";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg w-[90vw] rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Calculadora de Discos ({unit.toUpperCase()})
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* Unit Selector */}
          <div className="flex gap-2">
            <Button
              variant={unit === "kg" ? "default" : "outline"}
              size="sm"
              onClick={() => handleUnitChange("kg")}
              className="flex-1"
            >
              Kilogramos (kg)
            </Button>
            <Button
              variant={unit === "lbs" ? "default" : "outline"}
              size="sm"
              onClick={() => handleUnitChange("lbs")}
              className="flex-1"
            >
              Libras (lbs)
            </Button>
          </div>

          {/* Bar Weight */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium shrink-0">Barra:</label>
            <div className="flex items-center gap-1 flex-1">
              <Input
                type="text"
                value={barWeight}
                onChange={(e) => handleBarWeightChange(e.target.value)}
                placeholder="0"
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
          </div>

          {/* Target Weight */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium shrink-0">
              Peso objetivo:
            </label>
            <div className="flex items-center gap-1 flex-1">
              <Input
                type="text"
                value={targetWeight}
                onChange={(e) => handleTargetChange(e.target.value)}
                placeholder="0"
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
          </div>

          {/* Result with Barbell Visualization */}
          {targetWeight && parseFloat(targetWeight) > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Discos por lado:</span>
                  <span className="text-primary font-bold">
                    {platesDisplay}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {/* Barbell Visualization */}
                {platesForVisualization.length > 0 && (
                  <div className="flex items-center justify-center my-4 gap-0">
                    {/* Left plates */}
                    <div className="flex items-center gap-0.5">
                      {[...platesForVisualization].reverse().map((plate, i) => (
                        <div
                          key={`left-${i}`}
                          className="rounded-sm border border-black/20"
                          style={{
                            width: `${getPlateWidth(plate, unit)}px`,
                            height: `${getPlateHeight(plate, unit)}px`,
                            backgroundColor: getPlateColor(plate, unit),
                          }}
                          title={`${plate} ${unit}`}
                        />
                      ))}
                    </div>

                    {/* Left collar */}
                    <div
                      className="h-6 bg-linear-to-r from-slate-500 to-slate-400 rounded-sm"
                      style={{ width: "6px" }}
                    />

                    {/* Bar */}
                    <div
                      className="h-3 bg-linear-to-r from-slate-400 via-slate-300 to-slate-400 rounded-full"
                      style={{ width: "50px" }}
                    />

                    {/* Center collar */}
                    <div
                      className="h-6 bg-linear-to-r from-slate-500 to-slate-400 rounded-sm"
                      style={{ width: "6px" }}
                    />

                    {/* Right plates */}
                    <div className="flex items-center gap-0.5">
                      {platesForVisualization.map((plate, i) => (
                        <div
                          key={`right-${i}`}
                          className="rounded-sm border border-black/20"
                          style={{
                            width: `${getPlateWidth(plate, unit)}px`,
                            height: `${getPlateHeight(plate, unit)}px`,
                            backgroundColor: getPlateColor(plate, unit),
                          }}
                          title={`${plate} ${unit}`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs text-center text-muted-foreground mt-2">
                  Peso total:{" "}
                  <span className="font-medium text-foreground">
                    {totalWeight} {unit}
                  </span>
                  {totalWeight !== parseFloat(targetWeight) && (
                    <span className="ml-1 text-amber-500">
                      (diff:{" "}
                      {Math.abs(totalWeight - parseFloat(targetWeight)).toFixed(
                        1,
                      )}{" "}
                      {unit})
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Conversion Tool */}
          <div className="border rounded-lg p-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConversion(!showConversion)}
              className="w-full flex items-center justify-between text-sm font-medium"
            >
              <span className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4" />
                {conversionLabel}
              </span>
              <span className="text-muted-foreground">
                {showConversion ? "▲" : "▼"}
              </span>
            </Button>

            {showConversion && (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={conversionInput}
                    onChange={(e) => setConversionInput(e.target.value)}
                    placeholder={
                      conversionFromUnit === "kg" ? "Ej: 100" : "Ej: 225"
                    }
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleConversionDirection}
                    className="flex items-center gap-1 text-xs"
                  >
                    {conversionFromUnit === "kg" ? "kg" : "lbs"}
                    <ArrowRightLeft className="h-3 w-3" />
                    {conversionFromUnit === "kg" ? "lbs" : "kg"}
                  </Button>
                </div>
                {conversionResult && (
                  <div className="text-sm text-center py-2 bg-muted rounded-md">
                    <span className="font-medium text-foreground">
                      {conversionResult}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Available Plates Reference */}
          <div className="text-xs text-muted-foreground">
            <p className="font-medium mb-1">Discos disponibles:</p>
            <p>
              {availablePlates.join(" + ")} {unit}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getPlateWidth(plate: number, unit: string): number {
  if (unit === "kg") {
    switch (plate) {
      case 25:
        return 18;
      case 20:
        return 16;
      case 15:
        return 14;
      case 10:
        return 12;
      case 5:
        return 10;
      case 2.5:
        return 8;
      default:
        return 8;
    }
  } else {
    switch (plate) {
      case 45:
        return 18;
      case 35:
        return 17;
      case 25:
        return 15;
      case 15:
        return 13;
      case 10:
        return 11;
      default:
        return 9;
    }
  }
}

function getPlateHeight(plate: number, unit: string): number {
  if (unit === "kg") {
    switch (plate) {
      case 25:
        return 70;
      case 20:
        return 65;
      case 15:
        return 55;
      case 10:
        return 45;
      case 5:
        return 35;
      case 2.5:
        return 25;
      default:
        return 25;
    }
  } else {
    switch (plate) {
      case 45:
        return 70;
      case 35:
        return 65;
      case 25:
        return 55;
      case 15:
        return 45;
      case 10:
        return 35;
      default:
        return 28;
    }
  }
}

function getPlateColor(plate: number, unit: string): string {
  if (unit === "kg") {
    switch (plate) {
      case 25:
        return "#dc2626";
      case 20:
        return "#2563eb";
      case 15:
        return "#16a34a";
      case 10:
        return "#ca8a04";
      case 5:
        return "#1f2937";
      case 2.5:
        return "#6b7280";
      default:
        return "#6b7280";
    }
  } else {
    // LBS colors: 45 Azul Rey, 35 Amarillo, 25 Verde Claro, 15 Naranja Oscuro, 10 Gris
    switch (plate) {
      case 45:
        return "#2563eb"; // Azul Rey
      case 35:
        return "#eab308"; // Amarillo
      case 25:
        return "#4ade80"; // Verde Claro
      case 15:
        return "#ea580c"; // Naranja Oscuro
      case 10:
        return "#6b7280"; // Gris
      default:
        return "#6b7280";
    }
  }
}
