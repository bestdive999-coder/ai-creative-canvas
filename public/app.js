const {
  $,
  $$,
  createClientId,
  clampNumber,
  clampUnit,
  normalizeHexColor,
  fileToDataUrl,
  loadImage,
  downloadDataUrl,
  downloadBlob,
  normalizeOpacity,
  safeName,
  formatFileSize,
  formatTemplateSize,
  escapeHtml,
  confirmWorkspaceDialog,
  promptWorkspaceDialog,
  showAiFailureDialog
} = window.EcommerceCanvasApp.utils;
const {
  els,
  state,
  maxAiReferenceImages,
  fullAspectRatioOptions,
  providerAspectRatioOptions,
  studioQualitySizeMap,
  studioSkillCategories,
  studioModelPresets,
  generationLoadingSpriteUrl,
  generationLoadingSpriteUrls,
  generationLoadingSpriteFrameCount,
  imageDimensionCache,
  canvasWorkWidth,
  canvasInitialWorkHeight,
  canvasDefaultZoom,
  canvasExtendStep,
  canvasExtendThreshold,
  canvasLayerSerializableProps,
  fallbackAiSkillDefinitions,
  aiProviders,
  thinkingModeHints
} = window.EcommerceCanvasApp.createAppState({ $, $$, createClientId });

function canvasObjectById(id) {
  const canvas = state.canvasBeta.canvas;
  if (!canvas || !id) return null;
  return canvas.getObjects().find((object) => object.id === id) || null;
}

const aiControlsController = window.EcommerceCanvasApp.createAiControlsController({
  els,
  state,
  aiProviders,
  thinkingModeHints,
  fallbackAiSkillDefinitions,
  studioSkillCategories,
  providerAspectRatioOptions,
  fullAspectRatioOptions,
  toast,
  syncStudioModelPanel: (...args) => syncStudioModelPanel(...args),
  syncStudioSettingsPanel: (...args) => syncStudioSettingsPanel(...args),
  syncStudioComposerControls: (...args) => syncStudioComposerControls(...args),
  updateComposerModelSummary: (...args) => updateComposerModelSummary(...args),
  renderCanvasImageAiControls: (...args) => renderCanvasImageAiControls(...args),
  loadClientConfig: (...args) => loadClientConfig(...args)
});
const {
  persistAiSettings,
  handleAiProviderChange,
  handleImageApiProviderChange,
  handleUserImageModelSave,
  handleUserImageModelSelect,
  handleUserImageModelReset,
  toggleAiSettingsDrawer,
  closeAiSettingsDrawer,
  toggleAiModelPrefsPanel,
  closeAiModelPrefsPanel,
  closeStudioComposerPopoversOnOutsideClick,
  currentThinkingMode,
  renderThinkingModeHint,
  handleThinkingModeChange,
  renderAiWebSearchToggle,
  toggleAiWebSearch,
  loadAiProviderSettings,
  currentAiProvider,
  currentImageApiProvider,
  imageApiProviderLabel,
  syncImageApiProviderControls,
  ensureConfiguredAiProvider,
  selectedAiConfig,
  clearLocalAiKeys,
  aiModelStorageKey,
  currentUserImageModel,
  renderUserImageModelControls,
  aiSkillDefinitions,
  selectedAiSkill,
  studioSkillCategoryForSkill,
  skillsForStudioCategory,
  renderAiSkillSelector,
  toggleAiSkillMenu,
  closeAiSkillMenu,
  closeAiSkillMenuOnOutsideClick,
  selectDisplayText,
  enhanceCustomSelects,
  refreshCustomSelect,
  closeCustomSelects,
  closeCustomSelectsOnOutsideClick,
  aspectRatioOptionsForProvider,
  syncAspectRatioOptionsForProvider,
  handleAiSkillMenuClick,
  updateAiProviderUi
} = aiControlsController;

async function loadClientConfig() {
  try {
    const response = await fetch("/api/client/config", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "配置读取失败");
    state.clientConfig = data;
  } catch {
    state.clientConfig = { ai: { providers: {} } };
  }
  window.dispatchEvent(new CustomEvent("ai-canvas-client-config-change", {
    detail: { config: state.clientConfig }
  }));
  clearLocalAiKeys();
  loadAiProviderSettings();
  renderAiSkillSelector();
}

function updateSummary() {
  const imageCount = state.aiDirect.generatedImages.length;
  const referenceCount = state.aiDirect.references.length;
  if (els.summaryLine) {
    els.summaryLine.textContent = window.EcommerceCanvasI18n?.format(
      "workspaceSummary",
      { references: referenceCount, images: imageCount },
      `AI Creative Canvas: ${referenceCount} reference images and ${imageCount} AI assets.`
    );
  }
}

const conversationController = window.EcommerceCanvasApp.createConversationController({
  els,
  state,
  aiProviders,
  createClientId,
  escapeHtml,
  currentAiProvider,
  currentImageApiProvider,
  currentThinkingMode,
  renderThinkingModeHint,
  loadAiProviderSettings,
  renderAiSkillSelector,
  renderReferencePreviewList: (...args) => renderReferencePreviewList(...args),
  renderSelectedEditImageState: (...args) => renderSelectedEditImageState(...args),
  renderCanvasFocusTargetChip: (...args) => renderCanvasFocusTargetChip(...args),
  renderAiChatList: (...args) => renderAiChatList(...args),
  renderRelayPreview: (...args) => renderRelayPreview(...args),
  switchStudioPanel: (...args) => switchStudioPanel(...args),
  toast
});
const {
  ensureActiveAiConversation,
  currentAiConversationSnapshot,
  cloneAiConversationSnapshot,
  applyAiConversation,
  loadAiConversations,
  loadAiConversation,
  openConversationFromHistory,
  createNewAiConversation,
  saveAiConversationDebounced,
  saveAiConversationNow,
  deleteAiConversation,
  renderAiConversationList
} = conversationController;

const aiSizeController = window.EcommerceCanvasApp.createAiSizeController({
  els,
  state,
  imageDimensionCache,
  studioQualitySizeMap,
  studioModelPresets,
  selectedCanvasImageObject: (...args) => selectedCanvasImageObject(...args),
  currentAiProvider,
  currentUserImageModel,
  currentImageApiProvider,
  imageApiProviderLabel,
  aspectRatioOptionsForProvider,
  saveAiConversationDebounced,
  toast,
  loadImage,
  selectedAiSkill,
  loadAiProviderSettings,
  handleImageApiProviderChange,
  closeAiSettingsDrawer,
  closeAiModelPrefsPanel,
  syncImageApiProviderControls,
  refreshCustomSelect,
  aiRequestReferences: (...args) => aiRequestReferences(...args),
  isAiLocalEditRequest: (...args) => isAiLocalEditRequest(...args)
});
const {
  sizeForAspectRatio,
  canvasImageObjectOriginalSize,
  aiReferenceOriginalSizeSource,
  currentAutoOutputSizeSource,
  currentUiExactOutputSize,
  persistAiOutputSizeMode,
  updateStudioSizeInputs,
  activeStudioQuality,
  setStudioQuality,
  setStudioRatio,
  setStudioImageCount,
  handleAiCanvasSizeInput,
  handleStudioSettingsClick,
  syncStudioSettingsPanel,
  modelPresetForCurrentSelection,
  syncStudioModelPanel,
  syncStudioComposerControls,
  handleAiAutoModeToggle,
  handleAiModelPrefsClick,
  updateComposerModelSummary,
  aspectRatioValue,
  aspectRatioCandidatesForCurrentProvider,
  closestAspectRatioFromSize,
  setAspectRatioValue,
  ratioFromCanvasFrame,
  syncAspectRatioFromCanvasFrame,
  imageCacheKey,
  loadImageDimensions,
  imageHasTransparentPixels,
  isLightNeutralTransparentPreviewPixel,
  normalizeCheckerboardPreviewToTransparent,
  syncAspectRatioForAiRequest,
  isAiOutputSizeChangingRequest,
  isAiExactEditOutputRequest,
  isValidExactOutputSize,
  aiExactOutputSizeForRequest,
  resizeGeneratedImageToExactSize,
  resizeAiGeneratedImagesToExactSize
} = aiSizeController;

const canvasWorkspaceController = window.EcommerceCanvasApp.createCanvasWorkspaceController({
  els,
  state,
  toast,
  canvasWorkWidth,
  canvasInitialWorkHeight,
  canvasExtendThreshold,
  canvasExtendStep,
  bindFabricCanvasEvents: (...args) => bindFabricCanvasEvents(...args),
  bindCanvasContextMenu: (...args) => bindCanvasContextMenu(...args),
  bindCanvasKeyboardShortcuts: (...args) => bindCanvasKeyboardShortcuts(...args),
  ensureDefaultCanvasFrame: (...args) => ensureDefaultCanvasFrame(...args),
  renderCanvasAssets: (...args) => renderCanvasAssets(...args),
  renderCanvasLayers: (...args) => renderCanvasLayers(...args),
  setCanvasLayerPanelOpen: (...args) => setCanvasLayerPanelOpen(...args),
  updateCanvasPropsPanel: (...args) => updateCanvasPropsPanel(...args),
  resetCanvasView: (...args) => resetCanvasView(...args),
  updateCanvasObjectToolbar: (...args) => updateCanvasObjectToolbar(...args),
  renderCanvasFrameLabels: (...args) => renderCanvasFrameLabels(...args),
  insertCanvasAsset: (...args) => insertCanvasAsset(...args),
  importCanvasAssetFiles: (...args) => importCanvasAssetFiles(...args)
});
const {
  canvasBetaStatus,
  updateCanvasZoomLabel,
  isCanvasCameraMode,
  setCanvasViewportCenter,
  switchStudioPanel,
  initCanvasBeta,
  resizeCanvasToStage,
  bindCanvasStageResize,
  getCanvasContentBounds,
  getCanvasContentBottom,
  extendCanvasSide,
  extendCanvasDown,
  ensureCanvasBoundsForObjects,
  ensureCanvasBoundsForViewport,
  ensureCanvasHeightForObjects,
  canvasViewportCenterPoint,
  focusCanvasBounds,
  scrollCanvasToHome,
  bindCanvasStageDrop,
  stageDropPoint
} = canvasWorkspaceController;

const canvasEventsController = window.EcommerceCanvasApp.createCanvasEventsController({
  els,
  state,
  createClientId,
  escapeHtml,
  clampUnit,
  closestAspectRatioFromSize,
  toast,
  canvasBetaStatus,
  updateCanvasZoomLabel,
  updateCanvasObjectToolbar: (...args) => updateCanvasObjectToolbar(...args),
  updateCanvasPropsPanel: (...args) => updateCanvasPropsPanel(...args),
  renderCanvasLayers: (...args) => renderCanvasLayers(...args),
  renderCanvasFrameLabels: (...args) => renderCanvasFrameLabels(...args),
  ensureCanvasHeightForObjects,
  ensureCanvasBoundsForViewport,
  isCanvasCameraMode,
  markCanvasSpatialIndexDirty: (...args) => markCanvasSpatialIndexDirty(...args),
  applyCanvasViewportRenderWindow: (...args) => applyCanvasViewportRenderWindow(...args),
  scheduleCanvasViewportRenderWindowRestore: (...args) => scheduleCanvasViewportRenderWindowRestore(...args),
  restoreCanvasViewportRenderWindow: (...args) => restoreCanvasViewportRenderWindow(...args),
  beginCanvasRenderSample: (...args) => beginCanvasRenderSample(...args),
  endCanvasRenderSample: (...args) => endCanvasRenderSample(...args),
  selectedCanvasObject: (...args) => selectedCanvasObject(...args),
  resetCanvasImageAiEditorCollapse: (...args) => resetCanvasImageAiEditorCollapse(...args),
  handleCanvasErasePointer: (...args) => handleCanvasErasePointer(...args)
});
const {
  bindFabricCanvasEvents,
  captureCanvasFocusTarget,
  syncCanvasFocusTargetWithSelection,
  renderCanvasFocusTargetChip,
  clearCanvasFocusTarget
} = canvasEventsController;

const canvasAssetsController = window.EcommerceCanvasApp.createCanvasAssetsController({
  $,
  $$,
  els,
  state,
  createClientId,
  fileToDataUrl,
  loadImage,
  escapeHtml,
  toast,
  confirmWorkspaceDialog,
  initCanvasBeta,
  loadImageDimensions,
  imageHasTransparentPixels,
  closestAspectRatioFromSize,
  aspectRatioValue,
  canvasBetaStatus,
  selectedCanvasFrame: (...args) => selectedCanvasFrame(...args),
  selectedCanvasObject: (...args) => selectedCanvasObject(...args),
  updateCanvasPropsPanel: (...args) => updateCanvasPropsPanel(...args),
  stopCanvasImageEraseMode: (...args) => stopCanvasImageEraseMode(...args),
  ensureCanvasHeightForObjects,
  focusCanvasBounds,
  canvasObjectById,
  keepCanvasFramesBehind: (...args) => keepCanvasFramesBehind(...args),
  renderCanvasLayers: (...args) => renderCanvasLayers(...args),
  generationLoadingSpriteUrl,
  generationLoadingSpriteUrls,
  generationLoadingSpriteFrameCount
});
const {
  handleCanvasAssetInput,
  importCanvasAssetFiles,
  addCanvasAsset,
  activateCanvasSelectTool,
  activateCanvasToolMode,
  imageUrlToDataUrl,
  autoInsertGeneratedImagesToCanvas,
  createCanvasGenerationPlaceholder,
  createGenerationLoadingSprite,
  startCanvasGenerationPlaceholderTimer,
  clearCanvasGenerationPlaceholderTimer,
  updateCanvasGenerationPlaceholderProgress,
  replaceCanvasGenerationPlaceholder,
  markCanvasGenerationPlaceholderError,
  removeCanvasGenerationPlaceholder,
  addAiImageToCanvasAssets,
  renderCanvasAssets,
  renderCanvasAssetTarget,
  canvasInsertPoint,
  canvasObjectCanvasBounds,
  focusCanvasObjectList,
  canvasPointBesideObject,
  createCanvasAssetBatchLayout,
  fitCanvasImageIntoBox,
  fitCanvasImageForInitialInsert,
  insertCanvasAsset
} = canvasAssetsController;

const referenceController = window.EcommerceCanvasApp.createReferenceController({
  els,
  state,
  createClientId,
  fileToDataUrl,
  toast,
  setBusy,
  maxAiReferenceImages,
  loadImageDimensions,
  imageHasTransparentPixels,
  closestAspectRatioFromSize,
  clearCanvasFocusTarget,
  ensureActiveAiConversation,
  renderSelectedEditImageState: (...args) => renderSelectedEditImageState(...args),
  renderReferencePreviewList: (...args) => renderReferencePreviewList(...args),
  renderRelayPreview: (...args) => renderRelayPreview(...args),
  saveAiConversationDebounced,
  initCanvasBeta,
  addCanvasAsset,
  insertCanvasAsset,
  renderCanvasAssets,
  canvasBetaStatus,
  selectedEditImage: (...args) => selectedEditImage(...args),
  renderAiChatList: (...args) => renderAiChatList(...args)
});
const {
  handleReferenceImageInput,
  normalizeAiReferenceRole,
  imageIndexLabel,
  compactFileName,
  referenceVisibleSummary,
  chineseImageNumberToIndex,
  collectImageIndexesFromText,
  expandCompactImageList,
  inferReferenceRoleOverrides,
  addFilesToAiReferences,
  syncReferencesToCanvasAssets,
  isDirectWorkflowActive,
  handleAiDragOver,
  handleAiDragLeave,
  handleAiDrop,
  handleAiPaste,
  handleDirectPromptInput,
  handleUseSelectedImageToggle
} = referenceController;

const authController = window.EcommerceCanvasApp.createAuthController({
  els,
  state,
  createClientId,
  loadAiConversations,
  saveAiConversationNow,
  renderAiConversationList,
  toast
});
const {
  clearLoginSecrets,
  bindAuthEvents,
  initAccount,
  refreshAccount,
  handleLoginSubmit,
  handleForgotPassword,
  openPasswordDialog,
  closePasswordDialog,
  handlePasswordChangeSubmit,
  handleLogout,
  requireLoggedIn,
  showLoginOverlay,
  hideLoginOverlay,
  renderAccountState,
  handleAuthFailure
} = authController;
bindAuthEvents();

const canvasLayerController = window.EcommerceCanvasApp.createCanvasLayerController({
  els,
  state,
  canvasDefaultZoom,
  createClientId,
  escapeHtml,
  toast,
  selectedCanvasObject: (...args) => selectedCanvasObject(...args),
  selectedCanvasFrame: (...args) => selectedCanvasFrame(...args),
  canvasObjectById,
  updateCanvasObjectToolbar: (...args) => updateCanvasObjectToolbar(...args),
  updateCanvasPropsPanel: (...args) => updateCanvasPropsPanel(...args),
  canvasBetaStatus,
  resetCanvasImageAiReferencesForObject: (...args) => resetCanvasImageAiReferencesForObject(...args),
  resizeCanvasToStage,
  isCanvasCameraMode,
  setCanvasViewportCenter,
  applyCanvasViewportRenderWindow: (...args) => applyCanvasViewportRenderWindow(...args),
  scheduleCanvasViewportRenderWindowRestore: (...args) => scheduleCanvasViewportRenderWindowRestore(...args)
});
const {
  canvasObjectTypeLabel,
  isCanvasObjectLocked,
  setCanvasObjectLocked,
  canvasFrameObjects,
  ensureCanvasObjectId,
  canvasFrameIndexMap,
  canvasFrameDisplayName,
  canvasLayerDisplayLabel,
  setCanvasLayerPanelOpen,
  toggleCanvasLayerHistory,
  renderCanvasLayerHistoryState,
  renderCanvasFrameLabels,
  renderCanvasLayers,
  duplicateCanvasSelection,
  deleteCanvasSelection,
  duplicateCanvasObject,
  deleteCanvasObject,
  keepCanvasFramesBehind,
  copyCanvasSelection,
  pasteCanvasClipboard,
  sendCanvasSelectionToChat,
  groupCanvasSelection,
  toggleCanvasSelectionVisible,
  toggleCanvasSelectionLock,
  zoomCanvasBy,
  fitCanvasView,
  resetCanvasView
} = canvasLayerController;

const canvasPerformanceController = window.EcommerceCanvasApp.createCanvasPerformanceController({
  els,
  state,
  escapeHtml
});
const {
  markCanvasSpatialIndexDirty,
  rebuildCanvasSpatialIndex,
  canvasVisibleObjectEntries,
  applyCanvasViewportRenderWindow,
  scheduleCanvasViewportRenderWindowRestore,
  restoreCanvasViewportRenderWindow,
  beginCanvasRenderSample,
  endCanvasRenderSample,
  updateCanvasPerformanceSnapshot,
  renderCanvasPerformancePanel,
  toggleCanvasPerformancePanel,
  bindCanvasPerformancePanel
} = canvasPerformanceController;
bindCanvasPerformancePanel();

const canvasProjectsController = window.EcommerceCanvasApp.createCanvasProjectsController({
  els,
  state,
  canvasInitialWorkHeight,
  canvasLayerSerializableProps,
  createClientId,
  toast,
  initCanvasBeta,
  canvasFrameObjects,
  syncAspectRatioFromCanvasFrame,
  updateCanvasPropsPanel: (...args) => updateCanvasPropsPanel(...args),
  renderCanvasLayers,
  resizeCanvasToStage,
  renderCanvasAssets,
  resetCanvasView,
  canvasInsertPoint
});
const {
  addCanvasFrame,
  ensureDefaultCanvasFrame,
  createCanvasProject,
  saveCanvasProject
} = canvasProjectsController;

const aiChatRendererController = window.EcommerceCanvasApp.createAiChatRendererController({
  els,
  state,
  escapeHtml,
  compactFileName,
  downloadDataUrl,
  addAiImageToCanvasAssets,
  toast,
  promptWorkspaceDialog,
  updateCanvasObjectToolbar: (...args) => updateCanvasObjectToolbar(...args),
  aiRequestReferences: (...args) => aiRequestReferences(...args),
  updateCanvasGenerationPlaceholderProgress,
  updateSummary: (...args) => updateSummary(...args),
  saveAiConversationNow,
  handleAuthFailure
});
const {
  renderAiGeneratedList,
  renderAiChatList,
  renderAiPendingMessage,
  renderAiGeneratedStatus,
  renderAiGeneratedError,
  openImagePreview,
  closeImagePreview,
  findGeneratedImage
} = aiChatRendererController;

const aiGenerationController = window.EcommerceCanvasApp.createAiGenerationController({
  els,
  state,
  createClientId,
  escapeHtml,
  safeName,
  downloadDataUrl,
  formatFileSize,
  toast,
  setBusy,
  loadImage,
  sleep,
  maxAiReferenceImages,
  requireLoggedIn,
  handleAuthFailure,
  refreshAccount,
  imageUrlToDataUrl,
  selectedAiConfig,
  selectedAiSkill,
  currentThinkingMode,
  ensureActiveAiConversation,
  cloneAiConversationSnapshot,
  currentAiConversationSnapshot,
  saveAiConversationNow,
  saveAiConversationDebounced,
  syncAspectRatioFromCanvasFrame,
  syncAspectRatioForAiRequest,
  currentUiExactOutputSize,
  aiExactOutputSizeForRequest,
  resizeAiGeneratedImagesToExactSize,
  loadImageDimensions,
  closestAspectRatioFromSize,
  clearCanvasFocusTarget,
  renderCanvasFocusTargetChip,
  addAiImageToCanvasAssets,
  autoInsertGeneratedImagesToCanvas,
  createCanvasGenerationPlaceholder,
  replaceCanvasGenerationPlaceholder,
  markCanvasGenerationPlaceholderError,
  removeCanvasGenerationPlaceholder,
  updateCanvasGenerationPlaceholderProgress,
  showAiFailureDialog,
  normalizeAiReferenceRole,
  imageIndexLabel,
  compactFileName,
  referenceVisibleSummary,
  inferReferenceRoleOverrides,
  updateSummary: (...args) => updateSummary(...args),
  updateCanvasObjectToolbar: (...args) => updateCanvasObjectToolbar(...args),
  renderAiWebSearchToggle,
  renderAiSkillSelector,
  renderAiGeneratedList,
  renderAiChatList,
  renderAiGeneratedStatus,
  renderAiGeneratedError,
  renderAiConversationList,
  openImagePreview,
  findGeneratedImage
});
const {
  clearAiConversation,
  buildAiCurrentTurnPrompt,
  composerReferenceForNewImage,
  newImageComposerContext,
  isAiRegenerateRequest,
  isAiLocalEditRequest,
  isAiReferenceMaterialRequest,
  inferCanvasFocusUsage,
  selectedEditImage,
  setSelectedEditImage,
  renderSelectedEditImageState,
  aiRequestReferences,
  snapshotComposerReferences,
  renderReferencePreviewList,
  renderRelayPreview,
  generateAiImages,
  pollAiImageGeneration,
  requestAiImageGeneration,
  extractAiGeneratedImages,
  enrichAiGeneratedImageDimensions,
  formatApiError,
  formatAiVisibleError,
  formatEmptyAiImageError,
  formatAiGenerationCompleteMessage,
} = aiGenerationController;

const canvasImageAiController = window.EcommerceCanvasApp.createCanvasImageAiController({
  els,
  state,
  createClientId,
  fileToDataUrl,
  escapeHtml,
  compactFileName,
  toast,
  setBusy,
  requireLoggedIn,
  handleAuthFailure,
  closestAspectRatioFromSize,
  loadImageDimensions,
  imageHasTransparentPixels,
  ensureActiveAiConversation,
  saveAiConversationNow,
  renderAiGeneratedList,
  renderAiChatList,
  refreshAccount,
  requestAiImageGeneration,
  pollAiImageGeneration,
  extractAiGeneratedImages,
  enrichAiGeneratedImageDimensions,
  resizeAiGeneratedImagesToExactSize,
  currentUserImageModel,
  addAiImageToCanvasAssets,
  createCanvasGenerationPlaceholder,
  replaceCanvasGenerationPlaceholder,
  markCanvasGenerationPlaceholderError,
  updateCanvasGenerationPlaceholderProgress,
  createCanvasAssetBatchLayout,
  focusCanvasObjectList,
  showAiFailureDialog,
  formatApiError,
  formatAiVisibleError,
  formatEmptyAiImageError,
  selectedCanvasImageObject: (...args) => selectedCanvasImageObject(...args),
  selectedCanvasObject: (...args) => selectedCanvasObject(...args),
  ensureCanvasObjectId,
  canvasObjectToolbarPosition: (...args) => canvasObjectToolbarPosition(...args),
  clampCanvasImageAiEditorPosition: (...args) => clampCanvasImageAiEditorPosition(...args),
  endCanvasImageAiDrag: (...args) => endCanvasImageAiDrag(...args),
  imageUrlToDataUrl,
  canvasBetaStatus,
  keepCanvasFramesBehind,
  updateCanvasPropsPanel: (...args) => updateCanvasPropsPanel(...args),
  updateCanvasObjectToolbar: (...args) => updateCanvasObjectToolbar(...args),
  renderCanvasLayers
});
const {
  setCanvasImageAiMode,
  renderCanvasImageAiControls,
  toggleCanvasImageAiWebSearch,
  openCanvasImageAiModelPrefs,
  openCanvasImageAiSettings,
  openCanvasImageAiReferencePicker,
  handleCanvasImageAiSettingsClick,
  handleCanvasImageAiSizeInput,
  handleCanvasImageAiModelClick,
  handleCanvasImageAiAutoModeToggle,
  updateCanvasImageAiMeta,
  resetCanvasImageAiReferencesForObject,
  renderCanvasImageAiReferences,
  handleCanvasImageAiReferenceInput,
  handleCanvasImageAiReferencePaste,
  handleCanvasImageAiReferenceDragOver,
  handleCanvasImageAiReferenceDragLeave,
  handleCanvasImageAiReferenceDrop,
  updateCanvasImageAiEditor,
  hideCanvasImageAiEditor,
  resetCanvasImageAiEditorCollapse,
  canvasImageObjectReference,
  submitCanvasImageAiEdit
} = canvasImageAiController;

const canvasImageEditingController = window.EcommerceCanvasApp.createCanvasImageEditingController({
  els,
  state,
  toast,
  createClientId,
  clampNumber,
  canvasObjectById,
  closestAspectRatioFromSize,
  setAspectRatioValue,
  ensureCanvasObjectId,
  resetCanvasImageAiReferencesForObject,
  updateCanvasObjectToolbar: (...args) => updateCanvasObjectToolbar(...args),
  updateCanvasPropsPanel: (...args) => updateCanvasPropsPanel(...args),
  renderCanvasLayers,
  canvasBetaStatus,
  imageUrlToDataUrl,
  insertCanvasAsset,
  createCanvasGenerationPlaceholder,
  replaceCanvasGenerationPlaceholder,
  markCanvasGenerationPlaceholderError,
  removeCanvasGenerationPlaceholder,
  showAiFailureDialog,
  renderCanvasAssets
});
const {
  startCanvasImageEraseMode,
  loadCanvasEditableImage,
  canvasErasePointerToPixel,
  drawCanvasEraseStroke,
  queueCanvasErasePreview,
  handleCanvasErasePointer,
  setFabricImageSource,
  stopCanvasImageEraseMode,
  prepareCanvasImageExpansion,
  removeNearWhiteCanvasImageBackground
} = canvasImageEditingController;

const canvasContextController = window.EcommerceCanvasApp.createCanvasContextController({
  els,
  state,
  createClientId,
  toast,
  selectedCanvasObject: (...args) => selectedCanvasObject(...args),
  updateCanvasPropsPanel: (...args) => updateCanvasPropsPanel(...args),
  renderCanvasLayers: (...args) => renderCanvasLayers(...args),
  copyCanvasSelection,
  pasteCanvasClipboard,
  activateCanvasSelectTool,
  addCanvasText: (...args) => addCanvasText(...args),
  addCanvasFrame,
  activateCanvasToolMode,
  deleteCanvasSelection,
  sendCanvasSelectionToChat,
  groupCanvasSelection,
  toggleCanvasSelectionVisible,
  toggleCanvasSelectionLock,
  removeNearWhiteCanvasImageBackground,
  stopCanvasImageEraseMode
});
const {
  bindCanvasContextMenu,
  bindCanvasKeyboardShortcuts,
  handleCanvasContextMenu,
  positionCanvasContextMenu,
  hideCanvasContextMenu,
  selectedCanvasContextObject,
  handleCanvasContextAction
} = canvasContextController;

const canvasObjectsController = window.EcommerceCanvasApp.createCanvasObjectsController({
  els,
  state,
  createClientId,
  toast,
  initCanvasBeta,
  canvasInsertPoint,
  syncAspectRatioFromCanvasFrame,
  renderCanvasLayers,
  canvasBetaStatus,
  updateCanvasImageAiEditor,
  ensureCanvasObjectId,
  updateCanvasZoomLabel,
  downloadDataUrl,
  safeName,
  startCanvasImageEraseMode,
  prepareCanvasImageExpansion,
  removeNearWhiteCanvasImageBackground
});
const {
  addCanvasText,
  addCanvasShape,
  selectedCanvasObject,
  isCanvasImageObject,
  selectedCanvasImageObject,
  selectedCanvasFrame,
  updateCanvasPropsPanel,
  updateCanvasObjectToolbar,
  clampCanvasImageAiEditorPosition,
  startCanvasImageAiDrag,
  moveCanvasImageAiDrag,
  endCanvasImageAiDrag,
  syncCanvasObjectToolbarButtons,
  canvasObjectToolbarPosition,
  handleCanvasObjectAction
} = canvasObjectsController;

const appShellController = window.EcommerceCanvasApp.createAppShellController({
  $$,
  els,
  state,
  aiProviders,
  clearLoginSecrets,
  loadAiProviderSettings,
  renderThinkingModeHint,
  renderAiSkillSelector,
  renderUserImageModelControls,
  updateComposerModelSummary,
  loadClientConfig,
  initAccount,
  renderAccountState,
  renderAiGeneratedList,
  renderAiConversationList,
  renderCanvasAssets,
  renderReferencePreviewList,
  renderAiWebSearchToggle,
  updateAiProviderUi,
  enhanceCustomSelects,
  renderRelayPreview,
  initCanvasBeta,
  toast,
  canvasBetaStatus,
  addCanvasFrame,
  addCanvasShape,
  activateCanvasToolMode,
  createCanvasProject,
  saveCanvasProject,
  handleCanvasAssetInput,
  activateCanvasSelectTool,
  addCanvasText,
  duplicateCanvasSelection,
  deleteCanvasSelection,
  setCanvasLayerPanelOpen,
  toggleCanvasLayerHistory,
  zoomCanvasBy,
  fitCanvasView,
  hideCanvasImageAiEditor,
  toggleCanvasImageAiWebSearch,
  openCanvasImageAiModelPrefs,
  openCanvasImageAiSettings,
  openCanvasImageAiReferencePicker,
  handleCanvasImageAiSettingsClick,
  handleCanvasImageAiSizeInput,
  handleCanvasImageAiModelClick,
  handleCanvasImageAiAutoModeToggle,
  submitCanvasImageAiEdit,
  handleCanvasImageAiReferenceInput,
  handleCanvasImageAiReferencePaste,
  handleCanvasImageAiReferenceDragOver,
  handleCanvasImageAiReferenceDragLeave,
  handleCanvasImageAiReferenceDrop,
  startCanvasImageAiDrag,
  handleCanvasObjectAction,
  handleCanvasContextAction,
  handleAiProviderChange,
  handleImageApiProviderChange,
  handleUserImageModelSave,
  handleUserImageModelSelect,
  handleUserImageModelReset,
  handleThinkingModeChange,
  toggleAiSettingsDrawer,
  toggleAiModelPrefsPanel,
  handleStudioSettingsClick,
  handleAiModelPrefsClick,
  handleAiAutoModeToggle,
  handleAiCanvasSizeInput,
  toggleAiSkillMenu,
  handleAiSkillMenuClick,
  persistAiSettings,
  handleReferenceImageInput,
  clearCanvasFocusTarget,
  toggleAiWebSearch,
  saveAiConversationNow,
  createNewAiConversation,
  handleDirectPromptInput,
  handleUseSelectedImageToggle,
  clearAiConversation,
  saveAiConversationDebounced,
  generateAiImages,
  handleAiPaste,
  closeAiSkillMenuOnOutsideClick,
  closeStudioComposerPopoversOnOutsideClick,
  closeCustomSelectsOnOutsideClick,
  handleAiDragOver,
  handleAiDragLeave,
  handleAiDrop,
  closeImagePreview,
  closeAiSettingsDrawer,
  closeAiModelPrefsPanel,
  closeAiSkillMenu,
  switchStudioPanel
});
const {
  init,
  openCanvasFilePicker,
  bindEvents,
  initWorkspaceHoverHints,
  switchWorkflow
} = appShellController;


function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  clearTimeout(toast.clearTimer);
  toast.timer = setTimeout(() => {
    els.toast.classList.remove("show");
    toast.clearTimer = setTimeout(() => {
      if (!els.toast.classList.contains("show")) els.toast.textContent = "";
    }, 220);
  }, 2800);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setBusy(isBusy) {
  state.busy = isBusy;
  [
    els.generateImagesBtn,
    els.exportAiZipBtn
  ].forEach((button) => {
    if (button) button.disabled = isBusy;
  });
}

init();
