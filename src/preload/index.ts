import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type CaptureProgress, type CloseKind, type PlanBoardApi } from '../shared/ipc'

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
  saveListingNote: (request) => ipcRenderer.invoke(IPC.saveListingNote, request),
  setPhotoRoom: (request) => ipcRenderer.invoke(IPC.setPhotoRoom, request),
  addPhotoTag: (request) => ipcRenderer.invoke(IPC.addPhotoTag, request),
  removePhotoTag: (request) => ipcRenderer.invoke(IPC.removePhotoTag, request),
  savePhotoNote: (request) => ipcRenderer.invoke(IPC.savePhotoNote, request),
  listTags: () => ipcRenderer.invoke(IPC.listTags),
  renameTag: (request) => ipcRenderer.invoke(IPC.renameTag, request),
  mergeTags: (request) => ipcRenderer.invoke(IPC.mergeTags, request),
  getInspiration: () => ipcRenderer.invoke(IPC.getInspiration),
  setUnsavedDetails: (dirty) => ipcRenderer.send(IPC.setUnsavedDetails, dirty === true),
  onCloseRequested: (listener) => {
    const handler = (_event: IpcRendererEvent, kind: CloseKind): void => listener(kind)
    ipcRenderer.on(IPC.closeRequested, handler)
    return () => {
      ipcRenderer.removeListener(IPC.closeRequested, handler)
    }
  },
  answerClose: (discard) => ipcRenderer.send(IPC.answerClose, discard === true)
}

contextBridge.exposeInMainWorld('planboard', api)
