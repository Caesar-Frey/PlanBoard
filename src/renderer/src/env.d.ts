/// <reference types="vite/client" />
import type { PlanBoardApi } from '../../shared/ipc'

declare global {
  interface Window {
    planboard: PlanBoardApi
  }
}
