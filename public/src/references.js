(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createReferenceController = function createReferenceController(deps) {
    const {
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
      renderSelectedEditImageState,
      renderReferencePreviewList,
      renderRelayPreview,
      saveAiConversationDebounced,
      initCanvasBeta,
      addCanvasAsset,
      insertCanvasAsset,
      renderCanvasAssets,
      canvasBetaStatus,
      selectedEditImage,
      renderAiChatList
    } = deps;

    async function handleReferenceImageInput(event) {
      try {
        await addFilesToAiComposer(Array.from(event.target?.files || []), "上传", { replace: false });
      } finally {
        if (event.target) event.target.value = "";
      }
    }

    function normalizeAiReferenceRole(role) {
      if (role === "base") return "base";
      if (role === "ignore") return "ignore";
      return "reference";
    }

    function imageIndexLabel(index) {
      return `图${index + 1}`;
    }

    function compactFileName(name, maxLength = 18) {
      const text = String(name || "").trim();
      if (!text) return "附件图片";
      if (text.length <= maxLength) return text;
      const dotIndex = text.lastIndexOf(".");
      const ext = dotIndex > 0 && text.length - dotIndex <= 8 ? text.slice(dotIndex) : "";
      const base = ext ? text.slice(0, -ext.length) : text;
      const headLength = Math.max(6, Math.floor((maxLength - ext.length - 1) * 0.58));
      const tailLength = Math.max(4, maxLength - ext.length - headLength - 1);
      return `${base.slice(0, headLength)}…${base.slice(-tailLength)}${ext}`;
    }

    function aiReferenceLimit() {
      const limit = Number(maxAiReferenceImages);
      return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
    }

    const detailPlanningFilePattern = /\.(?:xlsx|xls|csv)$/i;
    const detailPlanningFileLimit = 3;
    const detailPlanningFileMaxBytes = 5 * 1024 * 1024;
    const detailPlanningTextLimit = 12000;

    function isDetailPlanningFile(file) {
      return detailPlanningFilePattern.test(String(file?.name || ""))
        || [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "text/csv"
        ].includes(String(file?.type || "").toLowerCase());
    }

    function compactPlanningCell(value) {
      return String(value ?? "")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240);
    }

    function detailPlanningSheetScore(name, rows = []) {
      const text = String(name || "").trim();
      if (!text || /WpsReserved|CellImgList/i.test(text)) return -100;
      let score = 0;
      if (/详情/.test(text)) score += 12;
      if (/日销/.test(text)) score += 5;
      if (/通用/.test(text)) score += 4;
      if (/备案/.test(text)) score -= 3;
      if (/主图|推广图|修改意见/.test(text)) score -= 12;
      const hasWireframeHeader = rows.slice(0, 40).some((row) => {
        const values = (Array.isArray(row) ? row : []).map(compactPlanningCell);
        return values.includes("屏数") && values.includes("模块") && values.some((value) => /线框/.test(value));
      });
      if (hasWireframeHeader) score += 20;
      return score;
    }

    function detailPlanningWorkbookSheets(workbook) {
      const candidates = (workbook.SheetNames || []).map((name, workbookIndex) => {
        const sheet = workbook.Sheets?.[name];
        const rows = sheet ? window.XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          raw: false,
          blankrows: true
        }) : [];
        const score = detailPlanningSheetScore(name, rows);
        const populatedCellCount = rows.reduce((sum, row) => (
          sum + (Array.isArray(row) ? row.filter((value) => compactPlanningCell(value)).length : 0)
        ), 0);
        const hasWireframeHeader = rows.slice(0, 80).some((row) => {
          const values = (Array.isArray(row) ? row : []).map(compactPlanningCell);
          return values.includes("屏数") && values.includes("模块") && values.some((value) => /线框/.test(value));
        });
        return { name, sheet, rows, score, workbookIndex, populatedCellCount, hasWireframeHeader };
      });
      const valuable = candidates.filter((item) => (
        item.sheet
        && item.populatedCellCount > 0
        && item.score > -100
        && (item.hasWireframeHeader || /详情/.test(String(item.name || "")))
      ));
      if (valuable.length) return valuable;
      const fallback = candidates
        .filter((item) => item.sheet && item.populatedCellCount > 0 && item.score > -100)
        .sort((a, b) => b.score - a.score)[0];
      return fallback ? [fallback] : [];
    }

    function fitDetailPlanningSheetContents(sheetContents = []) {
      const sections = (Array.isArray(sheetContents) ? sheetContents : []).filter((item) => item?.content);
      if (!sections.length) return "";
      const separator = "\n\n";
      const available = Math.max(0, detailPlanningTextLimit - separator.length * (sections.length - 1));
      const baseQuota = Math.max(1, Math.floor(available / sections.length));
      let remaining = available;
      const quotas = sections.map((item) => {
        const quota = Math.min(item.content.length, baseQuota);
        remaining -= quota;
        return quota;
      });
      for (let index = 0; index < sections.length && remaining > 0; index += 1) {
        const extra = Math.min(remaining, sections[index].content.length - quotas[index]);
        quotas[index] += extra;
        remaining -= extra;
      }
      return sections.map((item, index) => item.content.slice(0, quotas[index])).join(separator);
    }

    function detailPlanningRowLines(rows, startRow, endRow, startColumn, endColumn) {
      const lines = [];
      for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
        const values = (Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [])
          .slice(startColumn, endColumn)
          .map(compactPlanningCell)
          .filter(Boolean);
        if (values.length) lines.push(`第${rowIndex + 1}行：${values.join(" | ")}`);
      }
      return lines;
    }

    function buildDetailWireframeContent(sheetInfo) {
      const { name, sheet, rows } = sheetInfo;
      const headerRow = rows.findIndex((row) => {
        const values = (Array.isArray(row) ? row : []).map(compactPlanningCell);
        return values.includes("屏数") && values.includes("模块") && values.some((value) => /线框/.test(value));
      });
      if (headerRow < 0) {
        const lines = detailPlanningRowLines(rows, 0, Math.min(rows.length - 1, 199), 0, 12);
        return {
          content: `【工作表：${compactPlanningCell(name)}】\n${lines.join("\n")}`,
          modules: [],
          rowCount: rows.length
        };
      }

      const productLines = detailPlanningRowLines(rows, 0, Math.max(0, headerRow - 1), 0, 10);
      const moduleStarts = [];
      const merges = Array.isArray(sheet?.["!merges"]) ? sheet["!merges"] : [];
      for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
        const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
        const screenText = compactPlanningCell(row[0]);
        const screen = Number(screenText);
        if (Number.isInteger(screen) && screen >= 1 && screen <= 32 && (compactPlanningCell(row[1]) || compactPlanningCell(row[2]))) {
          moduleStarts.push({
            screen,
            rowIndex,
            module: compactPlanningCell(row[1]) || compactPlanningCell(row[2]) || `第${screen}屏`,
            inferred: false
          });
          continue;
        }

        const headingCell = row.slice(1, 8).map((value, offset) => ({
          column: offset + 1,
          text: compactPlanningCell(value)
        })).find((item) => item.text);
        if (!headingCell || headingCell.text.length > 48 || /[|：:，,。；;]/.test(headingCell.text)) continue;
        const headingMerge = merges.find((merge) => (
          merge?.s?.r === rowIndex
          && headingCell.column >= merge?.s?.c
          && headingCell.column <= merge?.e?.c
          && (merge.e.r - merge.s.r >= 1 || merge.e.c - merge.s.c >= 2)
        ));
        if (!headingMerge) continue;
        const previousStart = moduleStarts[moduleStarts.length - 1];
        if (previousStart && rowIndex - previousStart.rowIndex < 4) continue;
        moduleStarts.push({
          screen: 0,
          rowIndex,
          module: headingCell.text,
          inferred: true
        });
      }
      moduleStarts.sort((a, b) => a.rowIndex - b.rowIndex);
      const modules = moduleStarts.map((module, index) => {
        const endRow = index + 1 < moduleStarts.length ? moduleStarts[index + 1].rowIndex - 1 : rows.length - 1;
        const wireframeLines = detailPlanningRowLines(rows, module.rowIndex, endRow, 2, 8);
        const requirementLines = detailPlanningRowLines(rows, module.rowIndex, endRow, 8, 10);
        const mergeCount = merges.filter((merge) => (
          merge?.s?.r >= module.rowIndex
          && merge?.s?.r <= endRow
          && merge?.e?.c >= 2
          && merge?.s?.c <= 9
        )).length;
        return {
          ...module,
          endRow,
          rowSpan: endRow - module.rowIndex + 1,
          mergeCount,
          wireframeLines,
          requirementLines
        };
      });
      const moduleText = modules.map((module, index) => [
        `【模板顺序${index + 1}${module.screen ? `｜屏号${module.screen}` : "｜无屏号独立版块"}｜${module.module}】`,
        `版式范围：原表第${module.rowIndex + 1}-${module.endRow + 1}行，约${module.rowSpan}行高，${module.mergeCount}个合并区块。`,
        module.wireframeLines.length ? `线框内容：\n${module.wireframeLines.join("\n")}` : "",
        module.requirementLines.length ? `修改/视觉要求：\n${module.requirementLines.join("\n")}` : ""
      ].filter(Boolean).join("\n")).join("\n\n");
      const content = [
        `【公司详情页线框模板：${compactPlanningCell(name)}】`,
        `识别到 ${modules.length} 个详情页模块。必须按下方“模板顺序”编排，屏号只是公司内部标记，不得自行按数字重排。`,
        productLines.length ? `模板旧商品示例内容（仅用于识别字段位置，不是本轮产品事实）：\n${productLines.join("\n")}` : "",
        moduleText
      ].filter(Boolean).join("\n\n");
      return { content, modules, rowCount: rows.length };
    }

    function decodePlanningXml(value) {
      return String(value || "")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    }

    function planningXmlAttribute(tag, name) {
      const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = String(tag || "").match(new RegExp(`(?:^|\\s)${escaped}=(?:\"([^\"]*)\"|'([^']*)')`, "i"));
      return decodePlanningXml(match?.[1] ?? match?.[2] ?? "");
    }

    function planningRelationshipMap(xml) {
      const relationships = new Map();
      (String(xml || "").match(/<Relationship\b[^>]*\/?\s*>/gi) || []).forEach((tag) => {
        const id = planningXmlAttribute(tag, "Id");
        const target = planningXmlAttribute(tag, "Target");
        if (id && target) relationships.set(id, target);
      });
      return relationships;
    }

    function resolvePlanningZipPath(basePath, target) {
      const parts = `${String(basePath || "").replace(/[^/]+$/, "")}${String(target || "")}`.split("/");
      const resolved = [];
      parts.forEach((part) => {
        if (!part || part === ".") return;
        if (part === "..") resolved.pop();
        else resolved.push(part);
      });
      return resolved.join("/");
    }

    function planningRelsPath(filePath) {
      const parts = String(filePath || "").split("/");
      const fileName = parts.pop();
      return [...parts, "_rels", `${fileName}.rels`].join("/");
    }

    function detailPlanningImageMime(path) {
      const extension = String(path || "").split(".").pop()?.toLowerCase();
      if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
      if (extension === "webp") return "image/webp";
      if (extension === "png") return "image/png";
      return "";
    }

    async function extractDetailPlanningImages(arrayBuffer, selectedSheetName, modules = [], sourceSheetIndex = 0) {
      if (!window.JSZip || !arrayBuffer) return [];
      const zip = await window.JSZip.loadAsync(arrayBuffer);
      const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
      const workbookRelsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
      if (!workbookXml || !workbookRelsXml) return [];
      const sheetTag = (workbookXml.match(/<sheet\b[^>]*\/?\s*>/gi) || []).find((tag) => (
        planningXmlAttribute(tag, "name").trim() === String(selectedSheetName || "").trim()
      ));
      const sheetRelationshipId = planningXmlAttribute(sheetTag, "r:id");
      const sheetTarget = planningRelationshipMap(workbookRelsXml).get(sheetRelationshipId);
      if (!sheetTarget) return [];
      const sheetPath = resolvePlanningZipPath("xl/workbook.xml", sheetTarget);
      const sheetXml = await zip.file(sheetPath)?.async("string");
      const sheetRelsXml = await zip.file(planningRelsPath(sheetPath))?.async("string");
      if (!sheetXml || !sheetRelsXml) return [];
      const drawingTag = String(sheetXml).match(/<drawing\b[^>]*\/?\s*>/i)?.[0] || "";
      const drawingRelationshipId = planningXmlAttribute(drawingTag, "r:id");
      const drawingTarget = planningRelationshipMap(sheetRelsXml).get(drawingRelationshipId);
      if (!drawingTarget) return [];
      const drawingPath = resolvePlanningZipPath(sheetPath, drawingTarget);
      const drawingXml = await zip.file(drawingPath)?.async("string");
      const drawingRelsXml = await zip.file(planningRelsPath(drawingPath))?.async("string");
      if (!drawingXml || !drawingRelsXml) return [];
      const drawingRelationships = planningRelationshipMap(drawingRelsXml);
      const anchors = String(drawingXml).match(/<xdr:(?:oneCellAnchor|twoCellAnchor)>[\s\S]*?<\/xdr:(?:oneCellAnchor|twoCellAnchor)>/gi) || [];
      const images = [];
      for (const [index, anchor] of anchors.entries()) {
        const embedId = anchor.match(/r:embed=(?:\"([^\"]+)\"|'([^']+)')/i)?.slice(1).find(Boolean) || "";
        const mediaTarget = drawingRelationships.get(embedId);
        if (!mediaTarget) continue;
        const mediaPath = resolvePlanningZipPath(drawingPath, mediaTarget);
        const mime = detailPlanningImageMime(mediaPath);
        const mediaFile = mime ? zip.file(mediaPath) : null;
        if (!mediaFile) continue;
        const row = Number(anchor.match(/<xdr:row>(\d+)<\/xdr:row>/i)?.[1] || 0);
        const column = Number(anchor.match(/<xdr:col>(\d+)<\/xdr:col>/i)?.[1] || 0);
        const module = [...modules].reverse().find((item) => row >= item.rowIndex) || null;
        const base64 = await mediaFile.async("base64");
        images.push({
          id: createClientId(),
          name: `${selectedSheetName || "工作表"}·内嵌图${index + 1}${module ? `（${module.module}）` : ""}`,
          size: Math.round(base64.length * 0.75),
          type: mime,
          url: `data:${mime};base64,${base64}`,
          width: 0,
          height: 0,
          aspectRatio: "",
          role: "reference",
          source: "detail_planning_workbook",
          sourceSheetName: String(selectedSheetName || "").trim(),
          sourceSheetIndex: Math.max(0, Number(sourceSheetIndex || 0)),
          anchorRow: row + 1,
          anchorColumn: column + 1,
          templateOrder: module ? modules.indexOf(module) + 1 : 0,
          templateScreen: module?.screen || 0,
          templateModule: module?.module || ""
        });
      }
      return images.sort((a, b) => a.anchorRow - b.anchorRow || a.anchorColumn - b.anchorColumn);
    }

    async function parseDetailPlanningFile(file) {
      if (!window.XLSX) throw new Error("表格解析库未加载，请刷新页面后重试。");
      if (Number(file?.size || 0) > detailPlanningFileMaxBytes) {
        throw new Error(`${file.name || "表格"} 超过 5MB，请精简后重试。`);
      }
      const arrayBuffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(arrayBuffer, {
        type: "array",
        cellFormula: false,
        cellHTML: false,
        cellDates: true,
        cellStyles: true
      });
      const selectedSheets = detailPlanningWorkbookSheets(workbook);
      if (!selectedSheets.length) throw new Error(`${file.name || "表格"} 没有可读取的工作表。`);
      const parsedSheets = [];
      for (const [selectedIndex, sheetInfo] of selectedSheets.entries()) {
        const wireframe = buildDetailWireframeContent(sheetInfo);
        const images = await extractDetailPlanningImages(arrayBuffer, sheetInfo.name, wireframe.modules, selectedIndex).catch((error) => {
          console.warn(`详情页线框内嵌图读取失败：${sheetInfo.name}`, error);
          return [];
        });
        parsedSheets.push({
          name: String(sheetInfo.name || "").trim(),
          workbookIndex: sheetInfo.workbookIndex,
          rowCount: wireframe.rowCount,
          moduleCount: wireframe.modules.length,
          modules: wireframe.modules.map((module, index) => ({
            order: index + 1,
            screen: module.screen || 0,
            name: module.module || "",
            rowStart: module.rowIndex + 1,
            rowEnd: module.endRow + 1
          })),
          embeddedImageCount: images.length,
          embeddedImages: images,
          content: [
            `【工作簿顺序${selectedIndex + 1}/${selectedSheets.length}｜来源 Sheet：${compactPlanningCell(sheetInfo.name)}】`,
            wireframe.content,
            images.length ? `本 Sheet 内嵌参考图：${images.length}张，已按原行位置排序并保留来源。` : ""
          ].filter(Boolean).join("\n\n")
        });
      }
      const embeddedImages = parsedSheets
        .flatMap((sheet) => sheet.embeddedImages)
        .sort((a, b) => a.sourceSheetIndex - b.sourceSheetIndex || a.anchorRow - b.anchorRow || a.anchorColumn - b.anchorColumn);
      const content = fitDetailPlanningSheetContents(parsedSheets);
      if (!content) throw new Error(`${file.name || "表格"} 没有可读取的单元格内容。`);
      return {
        id: createClientId(),
        kind: "spreadsheet",
        name: String(file.name || "详情页资料表").slice(0, 120),
        size: Number(file.size || 0),
        type: String(file.type || "application/octet-stream").slice(0, 120),
        sheetNames: (workbook.SheetNames || []).map((name) => String(name).trim()).filter(Boolean),
        selectedSheetName: parsedSheets[0]?.name || "",
        selectedSheetNames: parsedSheets.map((sheet) => sheet.name),
        sheets: parsedSheets.map(({ embeddedImages: _embeddedImages, content: _content, ...sheet }) => sheet),
        rowCount: parsedSheets.reduce((sum, sheet) => sum + sheet.rowCount, 0),
        wireframeModuleCount: parsedSheets.reduce((sum, sheet) => sum + sheet.moduleCount, 0),
        embeddedImages,
        content
      };
    }

    async function addFilesToDetailPlanningMaterials(fileList, sourceLabel = "上传") {
      const files = Array.from(fileList || []).filter(isDetailPlanningFile);
      if (!files.length) return 0;
      if (state.aiDirect.selectedSkillId !== "detail-page-planner-agent") {
        toast("表格资料只能在详情页策划 Agent 中使用。");
        return 0;
      }
      const materials = Array.isArray(state.aiDirect.detailPlanningMaterials)
        ? state.aiDirect.detailPlanningMaterials
        : [];
      const available = Math.max(0, detailPlanningFileLimit - materials.length);
      if (!available) {
        toast(`详情页资料最多支持 ${detailPlanningFileLimit} 个表格文件。`);
        return 0;
      }
      const accepted = files.slice(0, available);
      setBusy(true);
      try {
        const parsed = [];
        for (const file of accepted) parsed.push(await parseDetailPlanningFile(file));
        const currentLength = materials.reduce((sum, item) => sum + String(item?.content || "").length, 0);
        let remaining = Math.max(0, detailPlanningTextLimit - currentLength);
        const bounded = parsed.map((item) => {
          const content = item.content.slice(0, remaining);
          remaining -= content.length;
          return { ...item, content };
        }).filter((item) => item.content);
        state.aiDirect.detailPlanningMaterials = [...materials, ...bounded];
        ensureActiveAiConversation();
        renderReferencePreviewList();
        renderRelayPreview();
        saveAiConversationDebounced();
        if (accepted.length < files.length) toast(`最多支持 ${detailPlanningFileLimit} 个表格，已只加入前 ${accepted.length} 个。`);
        if (bounded.length) toast(`${sourceLabel}已加入 ${bounded.length} 个详情页资料表。`);
        return bounded.length;
      } catch (error) {
        console.error(error);
        toast(error.message || "详情页资料表读取失败。");
        return 0;
      } finally {
        setBusy(false);
      }
    }

    async function addFilesToAiComposer(fileList, sourceLabel = "上传", options = {}) {
      const files = Array.from(fileList || []);
      const planningFiles = files.filter(isDetailPlanningFile);
      const imageFiles = files.filter((file) => ["image/jpeg", "image/png"].includes(file.type));
      const unsupported = files.length - planningFiles.length - imageFiles.length;
      if (planningFiles.length) await addFilesToDetailPlanningMaterials(planningFiles, sourceLabel);
      if (imageFiles.length) await addFilesToAiReferences(imageFiles, sourceLabel, options);
      if (unsupported > 0) toast("参考图支持 JPG/PNG；详情页 Agent 另支持 XLSX/XLS/CSV。");
    }

    function referenceVisibleSummary(references = state.aiDirect.references) {
      return references.length
        ? `${references.length} 张图片已放入本轮，可直接说图1、图2`
        : "未上传图片";
    }

    function chineseImageNumberToIndex(token) {
      const raw = String(token || "").trim();
      if (!raw) return -1;
      if (/^\d+$/.test(raw)) return Number(raw) - 1;
      const map = {
        一: 0,
        二: 1,
        两: 1,
        三: 2,
        四: 3,
        五: 4,
        六: 5,
        七: 6,
        八: 7,
        九: 8,
        十: 9
      };
      return Object.prototype.hasOwnProperty.call(map, raw) ? map[raw] : -1;
    }

    function collectImageIndexesFromText(text) {
      const result = new Set();
      const source = String(text || "");
      const patterns = [
        /图\s*([一二两三四五六七八九十\d]+)/g,
        /第\s*([一二两三四五六七八九十\d]+)\s*张/g,
        /([一二两三四五六七八九十\d]+)\s*号图/g
      ];
      patterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(source))) {
          const index = chineseImageNumberToIndex(match[1]);
          if (index >= 0) result.add(index);
        }
      });
      return result;
    }

    function expandCompactImageList(text) {
      return String(text || "").replace(
        /图\s*([一二两三四五六七八九十\d])([一二两三四五六七八九十\d]{1,8})/g,
        (full, first, rest) => {
          const parts = [first, ...String(rest).split("")].filter(Boolean);
          return parts.map((part) => `图${part}`).join("");
        }
      );
    }

    function inferReferenceRoleOverrides(promptText = "", references = state.aiDirect.references || []) {
      const text = expandCompactImageList(promptText).replace(/[，、]/g, " ");
      const roles = new Map();
      references.forEach((image) => roles.set(image.id, normalizeAiReferenceRole(image.role)));

      const setIndexes = (indexes, role) => {
        indexes.forEach((index) => {
          const image = references[index];
          if (image) roles.set(image.id, role);
        });
      };
      const maxMentionedIndex = (value) => {
        let max = -1;
        collectImageIndexesFromText(value).forEach((index) => {
          max = Math.max(max, index);
        });
        return max;
      };
      const outputTargetIsStandalone = (match) => {
        if (!match || !match[1]) return false;
        const next = text[(match.index || 0) + match[0].length] || "";
        return !next || /[\s。.!！？?，,、；;：:）)]/.test(next);
      };

      const pairReferenceMatches = [
        ...text.matchAll(/图\s*([一二两三四五六七八九十\d])\s*(?:参考|借鉴|对照|仿照)\s*图\s*([一二两三四五六七八九十\d])/g)
      ];
      pairReferenceMatches.forEach((match) => {
        const baseIndex = chineseImageNumberToIndex(match[1]);
        const referenceIndex = chineseImageNumberToIndex(match[2]);
        if (baseIndex >= 0) setIndexes([baseIndex], "base");
        if (referenceIndex >= 0) setIndexes([referenceIndex], "reference");
      });

      const sourceToOutputMatches = [
        ...text.matchAll(/((?:图\s*[一二两三四五六七八九十\d]\s*(?:和|与|跟|及|以及|\s*)*)+)\s*(?:作为|当作)?\s*(?:基础|基于|素材|来源|原料)?\s*(?:合成|融合|合并|生成|输出|做成)\s*(?:图\s*([一二两三四五六七八九十\d]))?/g)
      ];
      sourceToOutputMatches.forEach((match) => {
        const sourceIndexes = collectImageIndexesFromText(match[1]);
        const outputIndex = chineseImageNumberToIndex(match[2]);
        if (outputIndex < 0 && sourceIndexes.size < 2) return;
        setIndexes(sourceIndexes, "base");
        const sourceMaxIndex = maxMentionedIndex(match[1]);
        if (outputIndex >= 0 && outputIndex > sourceMaxIndex && outputTargetIsStandalone({ 0: match[0], 1: match[2], index: match.index })) setIndexes([outputIndex], "ignore");
      });

      const referenceToTargetMatches = [
        ...text.matchAll(/(?:参考|借鉴|对照|仿照)\s*图\s*([一二两三四五六七八九十\d])\s*(?:生成|输出|做成|制作|变成|套到|应用到)\s*图\s*([一二两三四五六七八九十\d])/g)
      ];
      referenceToTargetMatches.forEach((match) => {
        const referenceIndex = chineseImageNumberToIndex(match[1]);
        const targetIndex = chineseImageNumberToIndex(match[2]);
        if (targetIndex >= 0) setIndexes([targetIndex], "base");
        if (referenceIndex >= 0) setIndexes([referenceIndex], "reference");
      });

      const ignoreMatches = [...text.matchAll(/(?:不用|不要|排除|忽略|去掉)\s*((?:图\s*[一二两三四五六七八九十\d]\s*)+)/g)];
      ignoreMatches.forEach((match) => setIndexes(collectImageIndexesFromText(match[1]), "ignore"));

      const baseMatches = [
        ...text.matchAll(/(?:基于|根据|沿用|保留|保持|修改|融合|合并)\s*((?:图\s*[一二两三四五六七八九十\d]\s*)+)/g),
        ...text.matchAll(/((?:图\s*[一二两三四五六七八九十\d]\s*)+)\s*(?:作为|当作|用作)?\s*(?:基图|底图|基础|主体|合成|融合|合并)/g),
        ...text.matchAll(/((?:图\s*[一二两三四五六七八九十\d]\s*)+)[^图]{0,20}(?:保持|保留)(?:不变|不改|原样)/g)
      ];
      baseMatches.forEach((match) => setIndexes(collectImageIndexesFromText(match[1]), "base"));

      const referenceMatches = [
        ...text.matchAll(/(?:参考|借鉴|风格参考|姿势参考)\s*((?:图\s*[一二两三四五六七八九十\d]\s*)+)/g),
        ...text.matchAll(/((?:图\s*[一二两三四五六七八九十\d]\s*)+)\s*(?:作为|当作|用作)?\s*参考/g)
      ];
      referenceMatches.forEach((match) => {
        collectImageIndexesFromText(match[1]).forEach((index) => {
          const image = references[index];
          if (image && roles.get(image.id) !== "base") roles.set(image.id, "reference");
        });
      });

      return roles;
    }

    async function addFilesToAiReferences(fileList, sourceLabel = "上传", options = {}) {
      const allowedTypes = new Set(["image/jpeg", "image/png"]);
      const selectedFiles = Array.from(fileList || []);
      const files = selectedFiles.filter((file) => allowedTypes.has(file.type));
      if (!files.length) {
        if (selectedFiles.length) toast("AI 对话框参考图仅支持 JPG / PNG。");
        return;
      }
      const shouldReplace = options.replace === true;
      const currentCount = shouldReplace ? 0 : state.aiDirect.references.length;
      if (!files.length) {
        toast("没有可加入的图片。");
        return;
      }
      const maxCount = aiReferenceLimit();
      const availableCount = Math.max(0, maxCount - currentCount);
      if (availableCount <= 0) {
        toast(`最多支持 ${maxCount} 张参考图，请先删除多余图片。`);
        return;
      }
      const acceptedFiles = files.slice(0, availableCount);
      if (acceptedFiles.length < files.length) {
        toast(`最多支持 ${maxCount} 张参考图，本次只加入前 ${acceptedFiles.length} 张。`);
      }

      setBusy(true);
      try {
        const images = await Promise.all(acceptedFiles.map(async (file, index) => {
          const url = await fileToDataUrl(file);
          const dimensions = await loadImageDimensions(url).catch(() => null);
          const width = Number(dimensions?.width || 0);
          const height = Number(dimensions?.height || 0);
          const isPng = /^image\/png/i.test(file.type || "") || /\.png$/i.test(file.name || "");
          const hasAlpha = isPng && await imageHasTransparentPixels(url).catch(() => false);
          return {
            id: createClientId(),
            name: file.name,
            size: file.size,
            type: file.type,
            url,
            width,
            height,
            hasAlpha,
            preserveLocal: isPng,
            aspectRatio: closestAspectRatioFromSize(width, height),
            role: "reference"
          };
        }));
        if (shouldReplace) {
          state.aiDirect.references = images;
        } else {
          state.aiDirect.references.push(...images);
        }
        state.aiDirect.selectedEditImageKey = "";
        state.aiDirect.useSelectedImageAsBase = false;
        clearCanvasFocusTarget({ silent: true });
        if (els.useSelectedImageInput) els.useSelectedImageInput.checked = false;
        ensureActiveAiConversation();
        renderSelectedEditImageState();
        renderReferencePreviewList();
        renderRelayPreview();
        saveAiConversationDebounced();
        toast(`${sourceLabel}已加入 ${images.length} 张图片，可直接说图1、图2。`);
      } catch (error) {
        console.error(error);
        toast(error.message || "图片读取失败。");
      } finally {
        setBusy(false);
      }
    }

    async function syncReferencesToCanvasAssets(images = [], options = {}) {
      const list = Array.isArray(images) ? images.filter((image) => image?.url) : [];
      if (!list.length) return;
      await initCanvasBeta();
      for (const [index, image] of list.entries()) {
        const asset = await addCanvasAsset({
          name: image.name || "附件素材",
          dataUrl: image.url,
          type: image.type || "image/png",
          width: image.width || 0,
          height: image.height || 0,
          aspectRatio: image.aspectRatio || "",
          hasAlpha: Boolean(image.hasAlpha),
          preserveLocal: Boolean(
            image.preserveLocal ||
            image.hasAlpha ||
            /^image\/png/i.test(image.type || "") ||
            /\.png$/i.test(image.name || "")
          )
        }, { status: false });
        if (options.autoInsert !== false) {
          await insertCanvasAsset(asset, {
            stagger: true,
            staggerIndex: index,
            autoArrange: true,
            initialMaxWidth: 1440,
            initialMaxHeight: 980
          }).catch((error) => {
            console.warn("附件插入画布失败", error);
          });
        }
      }
      renderCanvasAssets();
      if (options.status !== false) canvasBetaStatus(`已同步 ${list.length} 个附件到素材栏。`);
    }

    function isDirectWorkflowActive() {
      return document.querySelector('[data-workflow-panel="direct"]')?.classList.contains("active");
    }

    function clearAiDropHighlights() {
      [els.referencePreviewList, els.directWorkflow, els.aiChatList, els.directPromptInput]
        .filter(Boolean)
        .forEach((element) => element.classList.remove("is-drag-over"));
    }

    function handleAiDragOver(event) {
      if (!isDirectWorkflowActive()) return;
      const hasFiles = Array.from(event.dataTransfer?.items || []).some((item) => item.kind === "file");
      if (!hasFiles) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget?.classList?.add("is-drag-over");
    }

    function handleAiDragLeave(event) {
      event.stopPropagation();
      clearAiDropHighlights();
    }

    async function handleAiDrop(event) {
      if (!isDirectWorkflowActive()) return;
      const files = Array.from(event.dataTransfer?.files || []);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      clearAiDropHighlights();
      await addFilesToAiComposer(files, "拖拽", { replace: false });
    }

    async function handleAiPaste(event) {
      if (!isDirectWorkflowActive()) return;
      const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type?.startsWith("image/"));
      if (!files.length) {
        Array.from(event.clipboardData?.items || []).forEach((item) => {
          if (item.kind !== "file" || !item.type?.startsWith("image/")) return;
          const file = item.getAsFile?.();
          if (file) files.push(file);
        });
      }
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      await addFilesToAiReferences(files, "粘贴", { replace: false });
    }

    function handleDirectPromptInput(event) {
      state.aiDirect.prompt = event.target.value;
      ensureActiveAiConversation();
      renderRelayPreview();
      saveAiConversationDebounced();
    }

    function handleUseSelectedImageToggle(event) {
      const enabled = Boolean(event.target.checked);
      if (enabled && !selectedEditImage()) {
        state.aiDirect.useSelectedImageAsBase = false;
        event.target.checked = false;
        toast("请先在生成结果里选择一张图片。");
      } else {
        state.aiDirect.useSelectedImageAsBase = enabled;
      }
      renderSelectedEditImageState();
      renderRelayPreview();
      renderAiChatList();
    }

    return {
      handleReferenceImageInput,
      normalizeAiReferenceRole,
      imageIndexLabel,
      compactFileName,
      referenceVisibleSummary,
      chineseImageNumberToIndex,
      collectImageIndexesFromText,
      expandCompactImageList,
      inferReferenceRoleOverrides,
      isDetailPlanningFile,
      parseDetailPlanningFile,
      addFilesToDetailPlanningMaterials,
      addFilesToAiComposer,
      addFilesToAiReferences,
      syncReferencesToCanvasAssets,
      isDirectWorkflowActive,
      handleAiDragOver,
      handleAiDragLeave,
      handleAiDrop,
      handleAiPaste,
      handleDirectPromptInput,
      handleUseSelectedImageToggle
    };
  };
})();
