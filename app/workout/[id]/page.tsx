"use client"

import { use } from "react"
import { WorkoutMode } from "@/components/workout/workout-mode"

export default function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <WorkoutMode routineId={parseInt(id)} />
}
