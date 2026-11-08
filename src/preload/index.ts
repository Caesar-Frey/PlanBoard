import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type CaptureProgress, type PlanBoardApi } from '../shared/ipc'

/** The only surface the renderer can reach. Each method maps to one IPC channel. */
const api: PlanBoardApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  chooseLibraryFolder: () => ipcRenderer.invoke(IPC.chooseLibraryFolder),
  updatePerson: (input) => ipcRenderer.invoke(IPC.updatePerson, input),
  setCurrentPerson: (id) => ipcRenderer.invoke(IPC.setCurrentPerson, id),
  detectListing: (url) => ipcRenderer.invoke(IPC.detectListing, url),
  startCapture: (url) => ipcRenderer.invoke(IPC.startCapture, url),
  startManualCapture: (request) => ipcRenderer.invoke(IPC.startManualCapture, request),
  cancelCapture: () => ipcRenderer.invoke(IPC.cancelCapture),
  onCaptureProgress: (listener) => {
    // Wrap, so the renderer never sees the IpcRendererEvent (it exposes `sender`).
    const handler = (_event: IpcRendererEvent, progress: CaptureProgress): void =>
      listener(progress)
    ipcRenderer.on(IPC.captureProgress, handler)
    return () => {
      ipcRenderer.removeListener(IPC.captureProgress, handler)
    }
  },
  listRecent: () => ipcRenderer.invoke(IPC.listRecent),
  openListingFolder: (id) => ipcRenderer.invoke(IPC.openListingFolder, id),
  openListingUrl: (id) => ipcRenderer.invoke(IPC.openListingUrl, id),
  getListing: (id) => ipcRenderer.invoke(IPC.getListing, id),
  trashPhotos: (request) => ipcRenderer.invoke(IPC.trashPhotos, request),
  saveListingDetails: (request) => ipcRenderer.invoke(IPC.saveListingDetails, request),
  saveListingNote: (request) => ipcRenderer.invoke(IPC.saveListingNote, request)
}

contextBridge.exposeInMainWorld('planboard', api)
