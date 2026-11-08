import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type PlanBoardApi } from '../shared/ipc'

/** The only surface the renderer can reach. Each method maps to one IPC channel. */
const api: PlanBoardApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  chooseLibraryFolder: () => ipcRenderer.invoke(IPC.chooseLibraryFolder),
  updatePerson: (input) => ipcRenderer.invoke(IPC.updatePerson, input),
  setCurrentPerson: (id) => ipcRenderer.invoke(IPC.setCurrentPerson, id)
}

contextBridge.exposeInMainWorld('planboard', api)
