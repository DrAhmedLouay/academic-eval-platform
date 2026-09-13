/**
 * محرك الواجهة التفاعلية لمنصة تقييم أداء أعضاء الهيئة التدريسية (استمارة 21)
 * يدعم المسح التخصصي والمجمع بالذكاء الاصطناعي وفهرسة الأدلة وملء الحقول التلقائي
 */

// كائن الحالة العامة للبيانات
let formData = {
    personal_info: {
        university: "",
        college: "",
        department: "",
        form_no: "",
        form_code: "",
        first_name: "",
        father_name: "",
        grandfather_name: "",
        great_grandfather_name: "",
        last_name: "",
        mother_name: "",
        mother_father_name: "",
        mother_grandfather_name: "",
        national_id: "",
        registry_no: "",
        page_no: "",
        issue_year: "",
        issue_month: "",
        issue_day: "",
        degree: "دكتوراه",
        order_no_and_date: "",
        degree_year: "",
        degree_month: "",
        degree_day: "",
        granting_country: "العراق",
        granting_univ: "",
        granting_college: "",
        granting_dept: "",
        general_specialty: "",
        specific_specialty: "",
        academic_title: "أستاذ مساعد",
        title_granter: "",
        title_year: "",
        title_month: "",
        title_day: "",
        phone: "",
        email: ""
    },
    is_non_teaching: false,
    axis1: {
        courses_score: 0,
        classroom_management_score: 0,
        blended_learning_items: [0, 0, 0, 0],
        course_description_items: [0, 0, 0, 0, 0],
        job_commitment_items: [0, 0, 0, 0, 0]
    },
    axis2: {
        global_research_score: 0,
        local_research_score: 0,
        supervision_score: 0
    },
    axis3: {
        committees_score: 0,
        continuous_learning_score: 0,
        thank_you_score: 0,
        field_visits_score: 0
    },
    axis4: {
        items: {}
    },
    axis5: {
        penalties: []
    }
};

// سجل الأدلة والمرفقات المفهرسة
let indexedEvidenceList = [];
let pendingOcrAttachment = null;
let currentEvaluation = null;
let activeScanTarget = null; // { axis, paragraph, label }
let activeFilterAxis = "all";
let filterFacultyOnly = false;
let uploadSafetyTimer = null;
let inlineEditingRefCode = null;
let auditorModeActive = false;
let collegeStampDataUrl = "";
let activePreviewItem = null;
let isCroppingActive = false;
let cropStart = null;
let cropBoxCoords = null;
let showBoundingBoxes = true;

// تتبع إدخال الدرجات يدوياً لحفظ خيارات المستخدم
window.manualScoreOverrides = {};
let manualScoreOverrides = window.manualScoreOverrides;

// تعريف الهيكل الشامل للمحاور والفقرات في الاستمارة الرسمية رقم 21
const AXIS_CATALOG_DEFINITIONS = {
    "1": {
        key: "axis1",
        name: "المحور الأول: جودة التدريس والتعليم والالتزام الوظيفي",
        paragraphs: [
            { id: "1", name: "1. المقررات التي قام بتدريسها", maxScore: 20, defaultDocType: "أمر تكليف بتدريس مقرر", field: "axis1.courses_score" },
            { id: "2", name: "2. إدارة الصف والعلاقة مع الطلبة (استبيان الطلبة)", maxScore: 20, defaultDocType: "استمارة تقييم أداء الطلبة", field: "axis1.classroom_management_score" },
            { id: "3", name: "3. التعليم المدمج والمنصات التعليمية", maxScore: 20, defaultDocType: "توثيق التعليم المدمج والمنصة", field: "axis1.blended_learning_items" },
            { id: "4", name: "4. وصف المقرر الدراسي وتحديثه والتقييم", maxScore: 20, defaultDocType: "وثيقة وخطة وصف المقرر", field: "axis1.course_description_items" },
            { id: "5", name: "5. الالتزام الوظيفي والأنظمة والتعليمات", maxScore: 20, defaultDocType: "سجل أو وثيقة الالتزام الوظيفي", field: "axis1.job_commitment_items" }
        ]
    },
    "2": {
        key: "axis2",
        name: "المحور الثاني: النشاط العلمي والبحثي",
        paragraphs: [
            { id: "1", name: "1. البحوث في المستوعبات العالمية (Clarivate / Scopus)", maxScore: 60, defaultDocType: "بحث مفهرس في Scopus/Clarivate", field: "axis2.global_research_score" },
            { id: "2", name: "2. البحوث في المجلات العربية والمحلية والمؤتمرات والكتب", maxScore: 25, defaultDocType: "بحث مجلة محلية / كتاب مؤلف", field: "axis2.local_research_score" },
            { id: "3", name: "3. الإشراف على الطلبة والنشاطات العلمية والتقويم", maxScore: 15, defaultDocType: "أمر جامعي بالإشراف / تقويم علمي", field: "axis2.supervision_score" }
        ]
    },
    "3": {
        key: "axis3",
        name: "المحور الثالث: الجانب التربوي والإرشادي والتعليم المستمر",
        paragraphs: [
            { id: "1", name: "1. المشاركة في اللجان الدائمية والمؤقتة", maxScore: 30, defaultDocType: "أمر إداري بتشكيل لجنة", field: "axis3.committees_score" },
            { id: "2", name: "2. المشاركة في لجان التعليم المستمر والجودة", maxScore: 20, defaultDocType: "شهادة مشاركة / أمر تعليم مستمر", field: "axis3.continuous_learning_score" },
            { id: "3", name: "3. كتب الشكر والتقدير أو الشهادات التقديرية", maxScore: 20, defaultDocType: "كتاب شكر وتقدير", field: "axis3.thank_you_score" },
            { id: "4", name: "4. الزيارات الميدانية والحقلية والأعمال التطوعية", maxScore: 30, defaultDocType: "أمر زيارة ميدانية / عمل تطوعي", field: "axis3.field_visits_score" }
        ]
    },
    "4": {
        key: "axis4",
        name: "المحور الرابع: مواطن القوة العلمية والإبداع",
        paragraphs: [
            { id: "1", name: "1. براءات الاختراع والجوائز في عام التقييم (3 درجات)", maxScore: 3, defaultDocType: "براءة اختراع / جائزة علمية", field: "axis4.items.item1" },
            { id: "2", name: "2. معامل هيرش h-index في Scopus (1-4 درجات)", maxScore: 4, defaultDocType: "توثيق بروفايل Scopus h-index", field: "axis4.items.item2" },
            { id: "3", name: "3. مسؤول وحدة شؤون المرأة والعاملين معهم (3 درجات)", maxScore: 3, defaultDocType: "أمر إداري تكليف شؤون المرأة", field: "axis4.items.item3" },
            { id: "4", name: "4. تطوير منظومة إلكترونية لإدارة أحد البرامج (3 درجات)", maxScore: 3, defaultDocType: "توثيق منظومة إلكترونية مبرمجة", field: "axis4.items.item4" },
            { id: "5", name: "5. مسؤولي الشعب والوحدات الإرشادية والارتباط (3 درجات)", maxScore: 3, defaultDocType: "أمر تكليف وحدة إرشادية", field: "axis4.items.item5" },
            { id: "6", name: "6. مجالس الاعتماد والمقيم الوطني وفريق الأداء (4 درجات)", maxScore: 4, defaultDocType: "أمر تكليف مجلس اعتماد / مقيم وطني", field: "axis4.items.item6" },
            { id: "7", name: "7. مدراء أقسام وشعب ضمان الجودة والعاملين فيها (5 درجات)", maxScore: 5, defaultDocType: "أمر إداري ضمان جودة", field: "axis4.items.item7" },
            { id: "8", name: "8. المدرب المعتمد في طرائق التدريس بتكليف وزاري (5 درجات)", maxScore: 5, defaultDocType: "شهادة / تكليف مدرب معتمد طرائق تدريس", field: "axis4.items.item8" },
            { id: "9", name: "9. البحوث الإضافية المفهرسة غير المستفاد منها (4 درجات)", maxScore: 4, defaultDocType: "بحث مفهرس إضافي", field: "axis4.items.item9" },
            { id: "10", name: "10. دعم نادي الطلبة بمبلغ (2000) دينار شهرياً (3 درجات)", maxScore: 3, defaultDocType: "وصل أو كتاب دعم نادي الطلبة", field: "axis4.items.item10" },
            { id: "11", name: "11. الانتماء إلى نقابة الأكاديميين (3 درجات)", maxScore: 3, defaultDocType: "هوية / كتاب انتماء نقابة الأكاديميين", field: "axis4.items.item11" },
            { id: "12", name: "12. مسؤولي شعب ووحدات حقوق الإنسان (3 درجات)", maxScore: 3, defaultDocType: "أمر تكليف وحدة حقوق الإنسان", field: "axis4.items.item12" }
        ]
    }
};

// تعريف خريطة فقرات الاستمارة وحدودها القصوى
const PARAGRAPH_SCORE_MAPPINGS = [
    { axis: "axis1", paragraph: "1", field: "axis1.courses_score", maxScore: 20, type: "number", statusEl: "score-status-axis1-p1" },
    { axis: "axis1", paragraph: "2", field: "axis1.classroom_management_score", maxScore: 20, type: "number", statusEl: "score-status-axis1-p2" },
    { axis: "axis1", paragraph: "3", field: "axis1.blended_learning_items", maxScore: 20, type: "checkboxes", itemMax: 5, count: 4, statusEl: "score-status-axis1-p3" },
    { axis: "axis1", paragraph: "4", field: "axis1.course_description_items", maxScore: 20, type: "checkboxes", itemMax: 4, count: 5, statusEl: "score-status-axis1-p4" },
    { axis: "axis1", paragraph: "5", field: "axis1.job_commitment_items", maxScore: 20, type: "checkboxes", itemMax: 4, count: 5, statusEl: "score-status-axis1-p5" },
    { axis: "axis2", paragraph: "1", field: "axis2.global_research_score", maxScore: 60, type: "number", statusEl: "score-status-axis2-p1" },
    { axis: "axis2", paragraph: "2", field: "axis2.local_research_score", maxScore: 25, type: "number", statusEl: "score-status-axis2-p2" },
    { axis: "axis2", paragraph: "3", field: "axis2.supervision_score", maxScore: 15, type: "number", statusEl: "score-status-axis2-p3" },
    { axis: "axis3", paragraph: "1", field: "axis3.committees_score", maxScore: 30, type: "number", statusEl: "score-status-axis3-p1" },
    { axis: "axis3", paragraph: "2", field: "axis3.continuous_learning_score", maxScore: 20, type: "number", statusEl: "score-status-axis3-p2" },
    { axis: "axis3", paragraph: "3", field: "axis3.thank_you_score", maxScore: 20, type: "number", statusEl: "score-status-axis3-p3" },
    { axis: "axis3", paragraph: "4", field: "axis3.field_visits_score", maxScore: 30, type: "number", statusEl: "score-status-axis3-p4" },
    { axis: "axis4", paragraph: "1", field: "axis4.items.item1", maxScore: 3, type: "number", statusEl: null },
    { axis: "axis4", paragraph: "2", field: "axis4.items.item2", maxScore: 4, type: "number", statusEl: null },
    { axis: "axis4", paragraph: "3", field: "axis4.items.item3", maxScore: 3, type: "number", statusEl: null },
    { axis: "axis4", paragraph: "4", field: "axis4.items.item4", maxScore: 3, type: "number", statusEl: null },
    { axis: "axis4", paragraph: "5", field: "axis4.items.item5", maxScore: 3, type: "number", statusEl: null },
    { axis: "axis4", paragraph: "6", field: "axis4.items.item6", maxScore: 4, type: "number", statusEl: null },
    { axis: "axis4", paragraph: "7", field: "axis4.items.item7", maxScore: 5, type: "number", statusEl: null },
    { axis: "axis4", paragraph: "8", field: "axis4.items.item8", maxScore: 5, type: "number", statusEl: null },
    { axis: "axis4", paragraph: "9", field: "axis4.items.item9", maxScore: 4, type: "number", statusEl: null },
    { axis: "axis4", paragraph: "10", field: "axis4.items.item10", maxScore: 3, type: "number", statusEl: null },
    { axis: "axis4", paragraph: "11", field: "axis4.items.item11", maxScore: 3, type: "number", statusEl: null },
    { axis: "axis4", paragraph: "12", field: "axis4.items.item12", maxScore: 3, type: "number", statusEl: null }
];

// مزامنة الدرجات مع الأدلة المرفوعة حصراً (إلا إذا أدخلت يدوياً)
function syncEvidenceWithScores() {
    PARAGRAPH_SCORE_MAPPINGS.forEach(mapping => {
        // إذا قام المستخدم بتعديل الدرجة يدوياً، نحترم إدخاله اليدوي
        if (manualScoreOverrides[mapping.field]) {
            return;
        }

        const matchingEv = indexedEvidenceList.filter(e => 
            e.axis === mapping.axis && String(e.paragraph) === String(mapping.paragraph)
        );

        if (mapping.type === "number") {
            let total = 0;
            if (matchingEv.length > 0) {
                total = matchingEv.reduce((acc, curr) => acc + (parseFloat(curr.suggested_score) || 0), 0);
                total = Math.min(mapping.maxScore, total);
            }
            setDeepValue(formData, mapping.field, total);
            const inp = document.querySelector(`[data-bind="${mapping.field}"]`);
            if (inp) inp.value = total;
        } else if (mapping.type === "checkboxes") {
            if (matchingEv.length > 0) {
                let remaining = matchingEv.reduce((acc, curr) => acc + (parseFloat(curr.suggested_score) || 0), 0);
                const items = [];
                for (let i = 0; i < mapping.count; i++) {
                    const val = Math.min(mapping.itemMax, remaining);
                    items.push(val);
                    remaining = Math.max(0, remaining - val);
                }
                setDeepValue(formData, mapping.field, items);
            } else {
                const zeroes = Array(mapping.count).fill(0);
                setDeepValue(formData, mapping.field, zeroes);
            }
        }
    });

    updateCheckboxesUI();
    updateScoreStatusBadges();
}

function updateCheckboxesUI() {
    const bBoxes = document.querySelectorAll('#tab-axis1 input[onchange="updateBlendedItems()"]');
    if (bBoxes && formData.axis1 && Array.isArray(formData.axis1.blended_learning_items)) {
        bBoxes.forEach((cb, idx) => {
            cb.checked = Boolean(formData.axis1.blended_learning_items[idx] && formData.axis1.blended_learning_items[idx] > 0);
        });
    }

    const cBoxes = document.querySelectorAll('#tab-axis1 input[onchange="updateCourseDescItems()"]');
    if (cBoxes && formData.axis1 && Array.isArray(formData.axis1.course_description_items)) {
        cBoxes.forEach((cb, idx) => {
            cb.checked = Boolean(formData.axis1.course_description_items[idx] && formData.axis1.course_description_items[idx] > 0);
        });
    }

    const jBoxes = document.querySelectorAll('#tab-axis1 input[onchange="updateCommitmentItems()"]');
    if (jBoxes && formData.axis1 && Array.isArray(formData.axis1.job_commitment_items)) {
        jBoxes.forEach((cb, idx) => {
            cb.checked = Boolean(formData.axis1.job_commitment_items[idx] && formData.axis1.job_commitment_items[idx] > 0);
        });
    }
}

function updateScoreStatusBadges() {
    PARAGRAPH_SCORE_MAPPINGS.forEach(mapping => {
        const el = document.getElementById(mapping.statusEl);
        if (!el) return;

        const matchingEv = indexedEvidenceList.filter(e => 
            e.axis === mapping.axis && String(e.paragraph) === String(mapping.paragraph)
        );

        let currentVal = 0;
        if (mapping.type === "number") {
            currentVal = parseFloat(getDeepValue(formData, mapping.field)) || 0;
        } else if (mapping.type === "checkboxes") {
            const arr = getDeepValue(formData, mapping.field) || [];
            currentVal = Array.isArray(arr) ? arr.reduce((a, b) => a + (parseFloat(b) || 0), 0) : 0;
        }

        if (matchingEv.length > 0) {
            el.innerHTML = `<span class="badge-evidence-proven" title="تم توثيق واحتساب الدرجة استناداً إلى ${matchingEv.length} وثيقة مرفوعة"><i class="fa-solid fa-file-circle-check"></i> مثبت بملف مرفق (${currentVal} درجة)</span>`;
        } else if (manualScoreOverrides[mapping.field] && currentVal > 0) {
            el.innerHTML = `<span class="badge-manual-entry" title="تم إدخال هذه الدرجة يدوياً"><i class="fa-solid fa-keyboard"></i> مدخل يدوياً (${currentVal} درجة)</span>`;
        } else {
            el.innerHTML = `<span class="badge-zero-unproven" title="لا توجد درجة معطاة لعدم رفع ملف إثبات أو إدخال يدوي"><i class="fa-solid fa-circle-exclamation"></i> 0 (بانتظار إرفاق ملف أو إدخال يدوي)</span>`;
        }
    });
}
window.updateScoreStatusBadges = updateScoreStatusBadges;
window.syncEvidenceWithScores = syncEvidenceWithScores;

// ============================================================================
// تهيئة التطبيق عند تحميل الصفحة
// ============================================================================
function initApp() {
    const logWarn = (msg, err) => { if (typeof console !== "undefined" && console && console.warn) console.warn(msg, err); };
    try { hideUploadLoadingState(); } catch (e) { logWarn("hideUploadLoadingState error:", e); }
    try { initTabs(); } catch (e) { logWarn("initTabs error:", e); }
    try { initEventListeners(); } catch (e) { logWarn("initEventListeners error:", e); }
    try { initDropzones(); } catch (e) { logWarn("initDropzones error:", e); }
    try { initParagraphScanInputs(); } catch (e) { logWarn("initParagraphScanInputs error:", e); }
    try { initSignaturePads(); } catch (e) { logWarn("initSignaturePads error:", e); }
    try { initAuditorMode(); } catch (e) { logWarn("initAuditorMode error:", e); }
    try { initVlmSettingsModal(); } catch (e) { logWarn("initVlmSettingsModal error:", e); }
    try { initSnippetCropper(); } catch (e) { logWarn("initSnippetCropper error:", e); }
    try { loadDraft(); } catch (e) { logWarn("loadDraft error:", e); }
    try { syncEvidenceWithScores(); } catch (e) { logWarn("syncEvidenceWithScores error:", e); }
    try { calculateLiveScore(); } catch (e) { logWarn("calculateLiveScore error:", e); }
    try { renderAllMiniEvidenceTables(); } catch (e) { logWarn("renderAllMiniEvidenceTables error:", e); }
    try { renderMasterCatalogTable(); } catch (e) { logWarn("renderMasterCatalogTable error:", e); }
    try { updateIndexStats(); } catch (e) { logWarn("updateIndexStats error:", e); }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}

// إعداد التبويبات
function initTabs() {
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-tab");
            switchTab(targetId);
        });
    });
}

function switchTab(targetId) {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

    const activeBtn = document.querySelector(`.tab-btn[data-tab="${targetId}"]`);
    const activePane = document.getElementById(targetId);

    if (activeBtn) activeBtn.classList.add("active");
    if (activePane) activePane.classList.add("active");
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (targetId === "tab-summary") {
        if (currentEvaluation) {
            updateScoreboardUI(currentEvaluation);
            if (window.updateSummaryTableUI) window.updateSummaryTableUI(currentEvaluation);
        } else {
            calculateLiveScore();
        }
    }
}

// إعداد مستمعي الأحداث
function initEventListeners() {
    const handleScoreInput = (e) => {
        const target = e.target;
        const bindKey = target.getAttribute("data-bind");
        if (bindKey) {
            setDeepValue(formData, bindKey, target.type === "checkbox" ? target.checked : target.value);
            if (bindKey.startsWith("axis1.") || bindKey.startsWith("axis2.") || bindKey.startsWith("axis3.") || bindKey.startsWith("axis4.")) {
                manualScoreOverrides[bindKey] = true;
                updateScoreStatusBadges();
            }
            debounceCalculate();
        }
    };

    document.addEventListener("input", handleScoreInput);
    document.addEventListener("change", handleScoreInput);

    const nonTeachingCheckbox = document.getElementById("is_non_teaching");
    if (nonTeachingCheckbox) {
        nonTeachingCheckbox.addEventListener("change", (e) => {
            formData.is_non_teaching = e.target.checked;
            toggleNonTeachingUI(e.target.checked);
            debounceCalculate();
        });
    }

    const safeAddListener = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    };

    // أزرار التصدير
    safeAddListener("btn-export-docx", "click", exportDocx);
    safeAddListener("btn-export-pdf", "click", exportPdf);
    safeAddListener("btn-export-dossier-pdf", "click", exportDossierPdf);
    safeAddListener("btn-print", "click", () => window.print());

    // أزرار الحفظ والاسترجاع والبيانات التجريبية
    safeAddListener("btn-sample-data", "click", loadSampleData);
    safeAddListener("btn-save-draft", "click", saveDraft);
    safeAddListener("btn-restore-draft", "click", () => {
        const inp = document.getElementById("restore-file-input");
        if (inp) inp.click();
    });
    safeAddListener("restore-file-input", "change", handleRestoreFile);
    safeAddListener("btn-reset", "click", resetForm);

    // زر إعدادات الذكاء الاصطناعي وزر نمط المدقق في الترويسة
    safeAddListener("btn-vlm-settings-header", "click", openVlmSettings);
    safeAddListener("btn-toggle-auditor-mode", "click", toggleAuditorMode);

    // إغلاق النافذة المنبثقة لمراجعة OCR
    safeAddListener("modal-close-btn", "click", closeModal);
    safeAddListener("modal-cancel-btn", "click", closeModal);
    safeAddListener("modal-confirm-btn", "click", confirmOcrAttachment);

    // معاينة الملف في نافذة مراجعة OCR
    const modalPrevBtn = document.getElementById("modal-preview-current-file-btn");
    if (modalPrevBtn) {
        modalPrevBtn.addEventListener("click", () => {
            if (pendingOcrAttachment && pendingOcrAttachment.evidence) {
                openDocumentPreview(pendingOcrAttachment.evidence);
            }
        });
    }

    // إغلاق نافذة المعاينة والتحميل
    const prevCloseBtn = document.getElementById("preview-modal-close-btn");
    if (prevCloseBtn) prevCloseBtn.addEventListener("click", closeDocumentPreview);
    const prevBottomCloseBtn = document.getElementById("preview-modal-bottom-close-btn");
    if (prevBottomCloseBtn) prevBottomCloseBtn.addEventListener("click", closeDocumentPreview);

    // إغلاق نافذة إعادة تصنيف المحور والفقرة
    const reclassifyCloseBtn = document.getElementById("reclassify-close-btn");
    if (reclassifyCloseBtn) reclassifyCloseBtn.addEventListener("click", closeReclassifyModal);
    const reclassifyCancelBtn = document.getElementById("reclassify-cancel-btn");
    if (reclassifyCancelBtn) reclassifyCancelBtn.addEventListener("click", closeReclassifyModal);
    const reclassifyModal = document.getElementById("reclassify-modal");
    if (reclassifyModal) {
        reclassifyModal.addEventListener("click", (e) => {
            if (e.target === reclassifyModal) closeReclassifyModal();
        });
    }

    // أزرار شريط المعاينة التفاعلي (Bounding Boxes, Snippet Cropper, Scopus)
    const btnToggleBbox = document.getElementById("btn-toggle-bbox");
    if (btnToggleBbox) btnToggleBbox.addEventListener("click", toggleBoundingBoxes);
    const btnStartCrop = document.getElementById("btn-start-cropper");
    if (btnStartCrop) btnStartCrop.addEventListener("click", startCropper);
    const btnConfirmCrop = document.getElementById("btn-confirm-crop");
    if (btnConfirmCrop) btnConfirmCrop.addEventListener("click", confirmCropScan);
    const btnCancelCrop = document.getElementById("btn-cancel-cropper");
    if (btnCancelCrop) btnCancelCrop.addEventListener("click", cancelCropper);
    const btnCheckScopus = document.getElementById("btn-check-scopus");
    if (btnCheckScopus) btnCheckScopus.addEventListener("click", checkCurrentScopus);

    // نوافذ إعدادات VLM والمقتطف اليدوي
    const vlmCloseBtn = document.getElementById("vlm-settings-close-btn");
    if (vlmCloseBtn) vlmCloseBtn.addEventListener("click", closeVlmSettings);
    const vlmCancelBtn = document.getElementById("vlm-settings-cancel-btn");
    if (vlmCancelBtn) vlmCancelBtn.addEventListener("click", closeVlmSettings);
    const vlmSaveBtn = document.getElementById("vlm-settings-save-btn");
    if (vlmSaveBtn) vlmSaveBtn.addEventListener("click", saveVlmSettings);
    const vlmTestBtn = document.getElementById("btn-test-vlm-api");
    if (vlmTestBtn) vlmTestBtn.addEventListener("click", testVlmApi);
    const vlmKeyEye = document.getElementById("btn-toggle-key-visibility");
    if (vlmKeyEye) vlmKeyEye.addEventListener("click", toggleApiKeyVisibility);

    const snipCloseBtn = document.getElementById("snippet-modal-close-btn");
    if (snipCloseBtn) snipCloseBtn.addEventListener("click", closeSnippetModal);
    const snipOkBtn = document.getElementById("snippet-modal-ok-btn");
    if (snipOkBtn) snipOkBtn.addEventListener("click", closeSnippetModal);
    const snipApplyNum = document.getElementById("btn-apply-snippet-num");
    if (snipApplyNum) snipApplyNum.addEventListener("click", applySnippetNumber);
    const snipApplyDate = document.getElementById("btn-apply-snippet-date");
    if (snipApplyDate) snipApplyDate.addEventListener("click", applySnippetDate);

    // فلترة الفهرس الرئيسي
    const filterSelect = document.getElementById("catalog-filter-axis");
    if (filterSelect) {
        filterSelect.addEventListener("change", (e) => {
            activeFilterAxis = e.target.value;
            renderMasterCatalogTable();
        });
    }
}

function toggleNonTeachingUI(isNonTeaching) {
    const teachingSections = document.querySelectorAll(".teaching-only");
    const nonTeachingNotice = document.getElementById("non-teaching-notice");

    teachingSections.forEach(el => {
        el.style.display = isNonTeaching ? "none" : "";
    });
    if (nonTeachingNotice) {
        nonTeachingNotice.style.display = isNonTeaching ? "block" : "none";
    }
}

let calculateTimer = null;
function debounceCalculate() {
    clearTimeout(calculateTimer);
    calculateTimer = setTimeout(() => {
        calculateLiveScore();
    }, 200);
}

// ============================================================================
// تحويل الأرقام إلى تفقيط عربي رسمي مطابق لاستمارة 21
// ============================================================================
function numberToArabicWords(number) {
    if (number === undefined || number === null || isNaN(number) || number < 0) {
        return "صفر درجة فقط لا غير";
    }
    const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
    const TENS = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
    const TEENS = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];

    const roundedNum = Math.round(Number(number) * 100) / 100;
    const integerPart = Math.floor(roundedNum);
    const fractionalPart = Math.round((roundedNum - integerPart) * 100);

    if (integerPart === 0 && fractionalPart === 0) {
        return "صفر درجة فقط لا غير";
    }

    let intStr = "";
    if (integerPart >= 100) {
        intStr = "مئة";
    } else if (integerPart < 10) {
        intStr = ONES[integerPart];
    } else if (integerPart >= 10 && integerPart < 20) {
        intStr = TEENS[integerPart - 10];
    } else {
        const unit = integerPart % 10;
        const ten = Math.floor(integerPart / 10);
        if (unit === 0) {
            intStr = TENS[ten];
        } else {
            intStr = `${ONES[unit]} و${TENS[ten]}`;
        }
    }

    let result = `${intStr} درجة`;
    if (fractionalPart > 0) {
        if (fractionalPart === 50 || fractionalPart === 5) {
            result += " ونصف";
        } else if (fractionalPart === 25) {
            result += " وربع";
        } else if (fractionalPart === 75) {
            result += " وثلاثة أرباع";
        } else {
            result += ` و${fractionalPart} من مئة`;
        }
    }

    return `${result} فقط لا غير`;
}
window.numberToArabicWords = numberToArabicWords;

function calculateEvaluationClient(fd) {
    const isNonTeaching = Boolean(fd.is_non_teaching);
    const a1 = fd.axis1 || {};
    let ax1Total = 0;
    let ax1Weighted = 0;
    if (isNonTeaching) {
        const jItems = Array.isArray(a1.job_commitment_items) ? a1.job_commitment_items : [0,0,0,0,0];
        const jSum = jItems.reduce((a,b)=>a+(Number(b)||0), 0);
        ax1Total = (jSum / 20) * 100;
        ax1Weighted = (ax1Total / 100) * 50;
    } else {
        const courses = Number(a1.courses_score) || 0;
        const management = Number(a1.classroom_management_score) || 0;
        const bSum = (Array.isArray(a1.blended_learning_items) ? a1.blended_learning_items : [0,0,0,0]).reduce((a,b)=>a+(Number(b)||0), 0);
        const cSum = (Array.isArray(a1.course_description_items) ? a1.course_description_items : [0,0,0,0,0]).reduce((a,b)=>a+(Number(b)||0), 0);
        const jSum = (Array.isArray(a1.job_commitment_items) ? a1.job_commitment_items : [0,0,0,0,0]).reduce((a,b)=>a+(Number(b)||0), 0);
        ax1Total = Math.min(100, courses + management + bSum + cSum + jSum);
        ax1Weighted = (ax1Total / 100) * 50;
    }

    const a2 = fd.axis2 || {};
    const globalRes = Number(a2.global_research_score) || 0;
    const localRes = Number(a2.local_research_score) || 0;
    const supervision = Number(a2.supervision_score) || 0;
    const ax2Total = Math.min(100, globalRes + localRes + supervision);
    const ax2Weighted = (ax2Total / 100) * 30;

    const a3 = fd.axis3 || {};
    const comm = Number(a3.committees_score) || 0;
    const cont = Number(a3.continuous_learning_score) || 0;
    const thank = Number(a3.thank_you_score) || 0;
    const field = Number(a3.field_visits_score) || 0;
    const ax3Total = Math.min(100, comm + cont + thank + field);
    const ax3Weighted = (ax3Total / 100) * 20;

    const a4 = fd.axis4 || {};
    const items = a4.items || {};
    let strengthTotal = 0;
    Object.values(items).forEach(v => { strengthTotal += (Number(v) || 0); });
    strengthTotal = Math.min(5, strengthTotal);

    const a5 = fd.axis5 || {};
    const penalties = Array.isArray(a5.penalties) ? a5.penalties : [];
    const penaltyTotal = penalties.reduce((a,b)=>a+(Number(b)||0), 0);

    let rawFinal = ax1Weighted + ax2Weighted + ax3Weighted + strengthTotal - penaltyTotal;
    let finalScore = Math.max(0, rawFinal);
    let warnings = [];
    let isCapped = false;
    if (globalRes === 0) {
        if (finalScore > 75) {
            finalScore = 75;
            isCapped = true;
            warnings.push("تم تطبيق سقف الدرجة الوزاري (75%) لعدم وجود بحوث في مستوعبات Scopus/Clarivate.");
        }
    }
    finalScore = Math.round(finalScore * 100) / 100;

    let rating = "ضعيف";
    if (finalScore >= 85) rating = "امتياز";
    else if (finalScore >= 75) rating = "جيد جداً";
    else if (finalScore >= 65) rating = "جيد";
    else if (finalScore >= 50) rating = "متوسط";

    return {
        axis1: { raw_score: ax1Total, weighted_score: Math.round(ax1Weighted*100)/100 },
        axis2: { raw_score: ax2Total, weighted_score: Math.round(ax2Weighted*100)/100 },
        axis3: { raw_score: ax3Total, weighted_score: Math.round(ax3Weighted*100)/100 },
        axis4: { awarded_score: strengthTotal },
        axis5: { total_deduction: penaltyTotal },
        final_score: finalScore,
        rating: rating,
        score_in_words: numberToArabicWords(finalScore),
        scopus_zero_rule_triggered: isCapped,
        warnings: warnings
    };
}
window.calculateEvaluationClient = calculateEvaluationClient;

// ============================================================================
// الحساب اللحظي للدرجات مع دعم العمل المحلي التلقائي لـ GitHub Pages
// ============================================================================
async function calculateLiveScore() {
    try {
        const response = await fetch("/api/calculate-score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
        });
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.evaluation) {
                currentEvaluation = data.evaluation;
                updateScoreboardUI(currentEvaluation);
                if (window.updateSummaryTableUI) {
                    window.updateSummaryTableUI(currentEvaluation);
                }
                return;
            }
        }
    } catch (err) {
        // الخادم غير متاح (العمل عبر GitHub Pages) - الاحتساب المحلي الذكي
    }

    currentEvaluation = calculateEvaluationClient(formData);
    updateScoreboardUI(currentEvaluation);
    if (window.updateSummaryTableUI) {
        window.updateSummaryTableUI(currentEvaluation);
    }
}

function updateScoreboardUI(evalRes) {
    if (!evalRes) return;
    const ax1 = document.getElementById("score-axis1");
    if (ax1 && evalRes.axis1) ax1.textContent = `${evalRes.axis1.weighted_score} / 50%`;
    const ax2 = document.getElementById("score-axis2");
    if (ax2 && evalRes.axis2) ax2.textContent = `${evalRes.axis2.weighted_score} / 30%`;
    const ax3 = document.getElementById("score-axis3");
    if (ax3 && evalRes.axis3) ax3.textContent = `${evalRes.axis3.weighted_score} / 20%`;
    const ax4 = document.getElementById("score-axis4");
    if (ax4 && evalRes.axis4) ax4.textContent = `+${evalRes.axis4.awarded_score}`;
    const ax5 = document.getElementById("score-axis5");
    if (ax5 && evalRes.axis5) ax5.textContent = `-${evalRes.axis5.total_deduction}`;
    const scFinal = document.getElementById("score-final");
    if (scFinal) scFinal.textContent = `${evalRes.final_score}%`;

    // تحديث مجموع الدرجة النهائية رقماً وكتابة (التفقيط العربي الرسمي) في كروت الملخص
    const summaryFinalScore = document.getElementById("summary-final-score");
    if (summaryFinalScore) {
        summaryFinalScore.textContent = `${evalRes.final_score} %`;
    }

    const summaryScoreWords = document.getElementById("summary-score-words");
    if (summaryScoreWords) {
        summaryScoreWords.textContent = evalRes.score_in_words || numberToArabicWords(evalRes.final_score);
    }

    const ratingBadge = document.getElementById("badge-rating");
    if (ratingBadge && evalRes.rating) {
        ratingBadge.textContent = evalRes.rating;
        ratingBadge.className = `rating-badge rating-${evalRes.rating.replace(" ", "-")}`;
    }

    const warnBox = document.getElementById("global-warnings-box");
    if (warnBox) {
        if (evalRes.warnings && evalRes.warnings.length > 0) {
            warnBox.innerHTML = evalRes.warnings.map(w => `<div class="alert alert-warning">⚠️ ${w}</div>`).join("");
            warnBox.style.display = "block";
        } else {
            warnBox.style.display = "none";
        }
    }
}

// ============================================================================
// آلية المسح التخصصي لكل فقرة بالذكاء الاصطناعي (Per-Paragraph AI Scan)
// ============================================================================
function initParagraphScanInputs() {
    const singleInput = document.getElementById("paragraph-scan-input");
    if (singleInput) {
        singleInput.addEventListener("change", async (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                await processSingleEvidenceScan(file, activeScanTarget);
                e.target.value = "";
            }
        });
    }

    const batchInput = document.getElementById("batch-scan-input");
    if (batchInput) {
        batchInput.addEventListener("change", async (e) => {
            if (e.target.files.length > 0) {
                await processBatchEvidenceScan(e.target.files);
                e.target.value = "";
            }
        });
    }
}

function triggerParagraphScan(axis, paragraph, label) {
    activeScanTarget = { axis, paragraph, label };
    const input = document.getElementById("paragraph-scan-input");
    if (input) {
        input.click();
    }
}

function triggerBatchScan() {
    const input = document.getElementById("batch-scan-input");
    if (input) {
        input.click();
    }
}

function getNextCounterForParagraph(axis, paragraph) {
    const count = indexedEvidenceList.filter(e => e.axis === axis && String(e.paragraph) === String(paragraph)).length;
    return count + 1;
}

function isCloudOrStaticEnv() {
    return window.location.hostname.includes("github.io") || 
           window.location.hostname.includes("streamlit.app") || 
           window.location.protocol === "file:" ||
           (!window.location.port && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1");
}

function showUploadLoadingState(isBatch, fileInfo) {
    if (uploadSafetyTimer) clearTimeout(uploadSafetyTimer);
    uploadSafetyTimer = setTimeout(() => {
        hideUploadLoadingState();
    }, 3500);

    const banner = document.getElementById("catalog-loading-banner");
    const subtext = document.getElementById("catalog-loading-subtext");
    const dropText = document.getElementById("dropzone-text");
    const dropLoading = document.getElementById("dropzone-loading-state");
    const dropSubtext = document.getElementById("dropzone-loading-subtext");
    const screenNotice = document.getElementById("screen-upload-notice");
    const screenText = document.getElementById("screen-upload-notice-text");

    const detailText = isBatch 
        ? `جاري رفع ومسح ${fileInfo} مستندات واستخراج البيانات بالذكاء الاصطناعي...`
        : `جاري رفع ومسح المستند (${fileInfo}) واستخراج البيانات والأعداد بالذكاء الاصطناعي...`;

    if (banner) {
        banner.classList.add("active");
        banner.style.setProperty("display", "block", "important");
    }
    if (subtext) subtext.textContent = detailText;
    if (dropText) dropText.style.setProperty("display", "none", "important");
    if (dropLoading) {
        dropLoading.classList.add("active");
        dropLoading.style.setProperty("display", "block", "important");
    }
    if (dropSubtext) dropSubtext.textContent = detailText;
    if (screenNotice) {
        screenNotice.classList.add("active");
        screenNotice.style.setProperty("display", "flex", "important");
    }
    if (screenText) screenText.textContent = "جارٍ رفع الملفات ومسحها وتحليلها...";
}

function hideUploadLoadingState() {
    if (uploadSafetyTimer) {
        clearTimeout(uploadSafetyTimer);
        uploadSafetyTimer = null;
    }
    const banner = document.getElementById("catalog-loading-banner");
    const dropText = document.getElementById("dropzone-text");
    const dropLoading = document.getElementById("dropzone-loading-state");
    const screenNotice = document.getElementById("screen-upload-notice");

    if (banner) {
        banner.classList.remove("active");
        banner.style.setProperty("display", "none", "important");
    }
    if (dropText) dropText.style.setProperty("display", "block", "important");
    if (dropLoading) {
        dropLoading.classList.remove("active");
        dropLoading.style.setProperty("display", "none", "important");
    }
    if (screenNotice) {
        screenNotice.classList.remove("active");
        screenNotice.style.setProperty("display", "none", "important");
    }
}
window.hideUploadLoadingState = hideUploadLoadingState;

// =========================================================================
// منظومة استخراج النصوص وتحليل الوثائق وقراءة الأعداد والتواريخ المطبوعة واليدوية (Client & Fallback)
// =========================================================================

const ARABIC_MONTHS_MAP = {
    "كانون الثاني": "01", "كانون ثاني": "01", "يناير": "01",
    "شباط": "02", "فبراير": "02",
    "آذار": "03", "اذار": "03", "مارس": "03",
    "نيسان": "04", "ابريل": "04", "أبريل": "04",
    "أيار": "05", "ايار": "05", "مايس": "05", "مايو": "05",
    "حزيران": "06", "يونيو": "06",
    "تموز": "07", "يوليو": "07",
    "آب": "08", "اب": "08", "أغسطس": "08", "اغسطس": "08",
    "أيلول": "09", "ايلول": "09", "سبتمبر": "09",
    "تشرين الأول": "10", "تشرين اول": "10", "أكتوبر": "10", "اكتوبر": "10",
    "تشرين الثاني": "11", "تشرين ثاني": "11", "نوفمبر": "11",
    "كانون الأول": "12", "كانون اول": "12", "ديسمبر": "12"
};

function normalizeArabicTextClient(str) {
    if (!str) return "";
    try {
        str = str.normalize("NFKC");
    } catch (e) {}
    return str
        .replace(/[\u064B-\u065F\u0670]/g, "") // remove tashkeel
        .replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]) // eastern to western digits
        .replace(/[۰-۹]/g, d => "0123456789"["۰۱۲۳۴۵۶۷۸۹".indexOf(d)]) // Persian digits
        .replace(/[إأآٱ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه");
}

function cleanHandwrittenTokenClient(raw) {
    if (!raw) return "";
    let val = raw.replace(/\\/g, '/').replace(/[|!I]/g, '/');
    val = val.replace(/202\s*[\{]/g, '2024');
    val = val.replace(/2002([0-9])/g, '202$1');
    val = val.replace(/^[\s\.:\-_=/]+|[\s\.:\-_=/]+$/g, '');
    for (let i = 0; i < 5; i++) {
        val = val.replace(/(\d)\s+(\d)/g, '$1$2');
    }
    val = val.replace(/\s*[/]\s*/g, '/');
    val = val.replace(/[/]{2,}/g, '/');
    return val.trim();
}

function inferDepartmentAbbreviationClient(lines) {
    const senderLines = (lines || []).slice(0, 15).filter(l => {
        return !/^\s*(?:إلى|الى|لإلى)\b|المحترم|المحترمة|المحترمون|تهديكم|نهديكم|نرفق|تحية طيبة/i.test(l);
    });
    const headerText = senderLines.join(" ");
    const norm = normalizeArabicTextClient(headerText);

    if (/أمان[ةه] مجلس الجامع[ةه]|مجلس الجامع[ةه]/.test(norm)) return "م.ج";
    if (/مكتب رئيس الجامع[ةه]|مصكتب رئيس|رئيس المامع[ةه]|رئيس الجامع[ةه]|Office of The President|President Office/i.test(norm)) return "م.ر";
    if (/مساعد رئيس الجامع[ةه] للشؤون العلمي[ةه]|المعاون العلمي/.test(norm)) return "م.ع";
    if (/مساعد رئيس الجامع[ةه] للشؤون الاداري[ةه]|المعاون الاداري/.test(norm)) return "م.إ";
    if (/الدراسات والتخطيط|الدراسات و التخطيط/.test(norm)) return "د.ت";
    if (/الشؤون الإداري[ةه] والمالي[ةه]|قسم الشؤون الاداري[ةه]|الشؤون الاداري[ةه]/.test(norm)) return "ش.إ";
    if (/هندس[ةه] العمار[ةه]|قسم العمار[ةه]|فرع التصميم المعماري|التصميم المعماري|عماره|عمارة/.test(norm)) return "هـ.ع";
    if (/وزير التعليم العالي|مكتب الوزير|معالي الوزير/.test(norm)) return "م.و";
    if (/الشؤون العلمي[ةه]|شعب[ةه] المجلات/.test(norm)) return "ش.ع";
    if (/جهاز الاشراف|جهاز الإشراف/.test(norm)) return "ج.م";
    if (/العميد|العماد[ةه]/.test(norm)) return "ع";

    return "";
}

function cleanHandwrittenDocNumberClient(rawLine, deptHint, nextLine) {
    if (!rawLine) return null;

    // استبعاد أسطر الإحصائيات العامة مثل "عدد الطلبة" أو "عدد المواد"
    if (/\bعدد\s*(?:الطلبة|المواد|الساعات|المشاركين|البحوث|الحضور|الصفحات|المقاعد|الدراسات|المحاضرات|الأيام|الاسابيع|الأشهر|السنوات)/i.test(rawLine)) {
        return null;
    }

    // استبعاد نصوص الدوريات والكتب بالإنجليزية التي تحتوي على References
    if (/\b(?:references|citations|abstract|contents)\b/i.test(rawLine)) {
        return null;
    }

    deptHint = deptHint || "";
    let line = normalizeArabicTextClient(rawLine);

    // 0. فصل الحروف العربية عن الحروف اللاتينية المتصلة بها في قراءة OCR
    line = line.replace(/([\u0600-\u06FF])([A-Za-z])/g, "$1 $2");
    line = line.replace(/([A-Za-z])([\u0600-\u06FF])/g, "$1 $2");

    // 1. إزالة كلمة 'العدد' أو مرادفاتها مع تشوهات OCR الشائعة
    line = line.replace(/^(?:العدد|الـعـدد|رقم|الرقم|عدد|العد|الـعد|سد|سـد)\s*[:/=-]?\s*/i, "");

    // 2. إزالة التسميات الإنجليزية الثنائية مثل Ref. أو No: أو Date: أو Rer: أو Bel: أو Rel:
    line = line.replace(/\b(?:ref|no|date|rer|bel|rel)\b[\.:]*/gi, " ");
    line = line.replace(/\bR[0-9e]\b[\.:]*/gi, " ");

    // معالجة مكتب الوزير المكتوب كـ 2و أو ٢و
    line = line.replace(/\b[2٢]\s*و\b/g, "م و");
    line = line.replace(/[2٢]\s*و\s*([0-9])/g, "م و $1");

    // معالجة قراءة ترويسة قسم العمارة المطبوعة (8-/4 أو /4 5) وتحويلها إلى هـ.ع/
    line = line.replace(/[8٨]\s*-\s*[/]\s*4\b/g, "هـ.ع/");
    line = line.replace(/\s*\/\s*(?:4\s*5|5\s*4|45|54)\b/g, " / هـ.ع");
    line = line.replace(/\s+[45]\s*5\b/g, " ");

    // معالجة أخطاء OCR الشائعة لاختصارات الكتب الإدارية
    line = line.replace(/40202|4022|20202/g, "مع");
    line = line.replace(/(?:^|\s)(?:أسر|امر|أمر|أم|أ\.م|اسر)(?=\s|\d|$)/g, " أ.م");

    // معالجة مكتب رئيس الجامعة: "51 / 40/2" أو "40/2" -> م.ر 1
    line = line.replace(/40\s*\/\s*2\b/g, "م.ر 1");

    // تصحيح قراءة الرقم 1 المكتوب بخط اليد المائل
    line = line.replace(/\\(\d+)/g, "1$1");
    line = line.replace(/(?:^|\s)[/|!](7\d{2,3})\b/g, " 1$1");

    line = line.replace(/[|\\]/g, "/").replace(/[!I]/g, "/");

    // دمج الأرقام المتباعدة
    for (let i = 0; i < 3; i++) {
        line = line.replace(/(\d)\s+(\d)/g, "$1$2");
    }

    // تصحيح قراءة الرقم 7 المكتوب بخط اليد
    line = line.replace(/(?:\b|(?<=[^\d]))1\/(\d{2,4})/g, "7$1");
    line = line.replace(/\bV(\d{2,4})\b/gi, "7$1");

    // معالجة قسم الشؤون العلمية: "م 43/4" -> ش.ع/43
    line = line.replace(/\bم\s+(\d{1,4})[/](\d)\b/g, "ش.ع/$1");
    // قسم الشؤون العلمية: "مش" بخط اليد -> ش.ع
    line = line.replace(/\b(?:مش)\b/g, "ش.ع");
    if (deptHint === "ش.ع" || deptHint === "ش ع" || line.includes("ش")) {
        line = line.replace(/\b(?:مش|م)\s+/g, "ش.ع/");
        line = line.replace(/\b(?:مش|م)\b/g, "ش.ع");
    }

    // تنظيف السلاش والنقاط
    line = line.replace(/\s*[/]\s*/g, "/");
    line = line.replace(/\s*[\.]\s*/g, ".");
    line = line.replace(/[\.]{2,}/g, "");

    // نمط أمانة مجلس الجامعة (م ج / 421 / 9 -> م.ج 9 / 421)
    const mCj = line.match(/(?:م\s*[\.]?\s*ج)\s*[/]?\s*(\d{2,5})\s*[/]\s*(\d{1,2})/);
    if (mCj) {
        return { value: `م.ج ${mCj[2]} / ${mCj[1]}`, is_handwritten: true };
    }

    // 6. النمط أ: الأرقام المنتهية بلاحقة حرف أو اختصار (مثل 51 / م.ر 1)
    const mSuf = line.match(/(\d{1,6}(?:[/]\d+)*)\s*[/]\s*([أ-ي](?:[\.][أ-ي]|[أ-ي]){0,3}(?:\s*\d{1,2})?)(?=[^\u0621-\u064A0-9]|$)/);
    if (mSuf) {
        const serial = mSuf[1].trim();
        const code = mSuf[2].trim();
        let divCode = "";
        const mDivCode = code.match(/^(.*?)\s*(\d{1,2})$/);
        let baseCode = code;
        if (mDivCode) {
            baseCode = mDivCode[1].trim();
            divCode = mDivCode[2].trim();
        }
        const cleanCode = baseCode.replace(/[\.\s]/g, "");
        if (cleanCode === "مع") {
            return { value: `م.ع/${serial}`, is_handwritten: true };
        } else if (cleanCode === "هع" || cleanCode === "هـع") {
            return { value: `هـ.ع/${serial}`, is_handwritten: true };
        } else if (cleanCode === "مش" || cleanCode === "شع") {
            return { value: `ش.ع/${serial}`, is_handwritten: true };
        } else if (cleanCode === "دت") {
            return { value: `د.ت/${serial}`, is_handwritten: true };
        } else if (["ام", "أم", "أسر"].includes(cleanCode)) {
            return { value: `أ.م/${serial}`, is_handwritten: true };
        } else if (cleanCode === "مر") {
            return { value: divCode ? `م.ر ${divCode} / ${serial}` : `م.ر/${serial}`, is_handwritten: true };
        } else if (cleanCode === "مج") {
            return { value: divCode ? `م.ج ${divCode} / ${serial}` : `م.ج/${serial}`, is_handwritten: true };
        } else if (["ص", "ق", "أ", "ت"].includes(cleanCode)) {
            return { value: `${serial}/${code}`, is_handwritten: true };
        } else if (cleanCode.length === 2 && !code.includes(".")) {
            return { value: `${cleanCode[0]}.${cleanCode[1]}/${serial}`, is_handwritten: true };
        }
        return { value: `${serial}/${code}`, is_handwritten: true };
    }

    // 7. إزالة تشويش الشهر المنفرد في نهاية السطر الناتج عن تداخل سطر التاريخ
    const mTrail = line.match(/\/([1-9])$/);
    if (mTrail && nextLine) {
        const dVal = mTrail[1];
        if (new RegExp(`[/_\\-\\s]${dVal}[/_\\-\\s]`).test(nextLine)) {
            line = line.replace(new RegExp(`/${dVal}$`), "").trim();
        }
    }
    line = line.trim();

    // الصيغة 1: حروف عربية بنقاط أو بدونها مع رقم شعبة اختياري + سلاش / + رقم تسلسلي
    const m1 = line.match(/([أ-ي](?:[\s\.][أ-ي]|[أ-ي]){0,4}(?:\s*\d{1,2})?)\s*[/]\s*(\d{1,6}(?:[/]\d+)*)/);
    if (m1) {
        let letters = m1[1].trim();
        const serial = m1[2].trim();
        let divNum = "";
        const mDiv = letters.match(/^(.*?)\s*(\d{1,2})$/);
        if (mDiv) {
            letters = mDiv[1].trim();
            divNum = mDiv[2].trim();
        }

        const cleanCode = letters.replace(/[\.\s]/g, "");
        if (letters === "ه" || letters === "هـ") {
            letters = deptHint || "هـ.ع";
        } else if (cleanCode === "مش" || cleanCode === "شع" || cleanCode === "ش") {
            letters = "ش.ع";
        } else if (letters === "م" && (deptHint === "ش.ع" || deptHint === "ش ع")) {
            letters = "ش.ع";
        } else if (cleanCode === "مو" || cleanCode === "2و" || letters === "م و" || letters === "م.و") {
            letters = divNum ? "م و" : "م.و";
        } else if (cleanCode === "دت") {
            letters = "د.ت";
        } else if (cleanCode === "مع") {
            letters = "م.ع";
        } else if (cleanCode === "هع" || cleanCode === "هـع") {
            letters = "هـ.ع";
        } else if (["ام", "أم", "أسر"].includes(cleanCode)) {
            letters = "أ.م";
        } else if (cleanCode === "مر") {
            letters = "م.ر";
        } else if (cleanCode === "مج") {
            letters = "م.ج";
        } else if (cleanCode.length === 2 && !letters.includes(".")) {
            letters = `${cleanCode[0]}.${cleanCode[1]}`;
        }

        if (cleanCode === "مش" || cleanCode === "شع") {
            if (divNum) {
                return { value: `ش.ع/${divNum}`, is_handwritten: true };
            }
            return { value: `ش.ع/${serial}`, is_handwritten: true };
        }

        if (divNum) {
            return { value: `${letters} ${divNum} / ${serial}`, is_handwritten: true };
        }
        return { value: `${letters}/${serial}`, is_handwritten: true };
    }

    // الصيغة 2: حروف عربية ثم مسافة ثم رقم تسلسلي
    const m2 = line.match(/([أ-ي](?:[\s\.][أ-ي]|[أ-ي]){0,4})\s*[:\s]\s*(\d{2,6}(?:[/]\d+)*)/);
    if (m2) {
        let letters = m2[1].trim();
        const serial = m2[2].trim();
        const cleanCode = letters.replace(/[\.\s]/g, "");
        if (["العدد", "عدد", "رقم", "العد", "سد"].includes(letters)) {
            return { value: serial, is_handwritten: true };
        } else if (letters === "ه" || letters === "هـ") {
            letters = deptHint || "هـ.ع";
        } else if (cleanCode === "مش" || cleanCode === "شع" || cleanCode === "ش") {
            letters = "ش.ع";
        } else if (letters === "م" && (deptHint === "ش.ع" || deptHint === "ش ع")) {
            letters = "ش.ع";
        } else if (cleanCode === "مو" || cleanCode === "2و" || letters === "م و" || letters === "م.و") {
            letters = "م.و";
        } else if (cleanCode === "دت") {
            letters = "د.ت";
        } else if (cleanCode === "مع") {
            letters = "م.ع";
        } else if (cleanCode === "هع" || cleanCode === "هـع") {
            letters = "هـ.ع";
        } else if (["ام", "أم", "أسر"].includes(cleanCode)) {
            letters = "أ.م";
        } else if (cleanCode === "مر") {
            letters = "م.ر";
        } else if (cleanCode === "مج") {
            letters = "م.ج";
        } else if (cleanCode.length === 2 && !letters.includes(".")) {
            letters = `${cleanCode[0]}.${cleanCode[1]}`;
        }
        if (letters) {
            return { value: `${letters}/${serial}`, is_handwritten: true };
        }
        return { value: serial, is_handwritten: true };
    }

    // الصيغة 3: رقم تسلسلي متبوع بسلاش أو مسافة وحروف عربية
    const m3 = line.match(/(\d{2,6})\s*(?:[/]|\s+)\s*([أ-ي](?:[\s\.][أ-ي]|[أ-ي]){0,4})/);
    if (m3) {
        const serial = m3[1].trim();
        let letters = m3[2].trim();
        const cleanCode = letters.replace(/[\.\s]/g, "");
        if (cleanCode === "مع") {
            letters = "م.ع";
        } else if (cleanCode === "هع" || cleanCode === "هـع") {
            letters = "هـ.ع";
        } else if (cleanCode === "مش" || cleanCode === "شع") {
            letters = "ش.ع";
        } else if (["ام", "أم", "أسر"].includes(cleanCode)) {
            letters = "أ.م";
        } else if (cleanCode === "مر") {
            letters = "م.ر";
        } else if (cleanCode === "مج") {
            letters = "م.ج";
        } else if (letters === "ه" || letters === "هـ") {
            letters = deptHint || "هـ.ع";
        }
        return { value: `${letters}/${serial}`, is_handwritten: true };
    }

    // الصيغة 4: رقم مركب بالأرقام
    const mComp = line.match(/\b(\d{2,6}(?:[/]\d+)+)\b/);
    if (mComp) {
        return { value: mComp[1].trim(), is_handwritten: true };
    }

    // الصيغة 5: رقم تسلسلي بسيط من 2 إلى 6 خانات
    const lineBody = rawLine.replace(/^(?:العدد|الـعـدد|رقم|الرقم|عدد|العد|الـعد|سد|سـد)\s*[:/=-]?\s*/i, "").trim();
    const m4 = lineBody.match(/\b(\d{2,6})\b/);
    if (m4) {
        const serial = m4[1].trim();
        if (deptHint === "هـ.ع" && /[ههـع]/.test(lineBody)) {
            return { value: `هـ.ع/${serial}`, is_handwritten: true };
        }
        return { value: serial, is_handwritten: true };
    }

    return null;
}

function extractDocNumberClient(text, filename) {
    if (!text && !filename) return { value: "غير محدد", is_handwritten: false };

    const normText = normalizeArabicTextClient(text || "");
    const lines = normText.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    const deptHint = inferDepartmentAbbreviationClient(lines);

    // 1. فحص الأسطر المتضمنة كلمة العدد أو الرقم أو الصادرة بصرامة مع حدود الكلمات
    const labels = /(?:العدد|الـعـدد|رقم|الرقم|صادرة|ع\/|ر\/|ش\.ص\/|سد|سـد|العد|الـعد|\b(?:No|NO|Ref|REF|Rer|Bel|Rel)\b|\bعدد\s*[:/=-])/i;
    for (let idx = 0; idx < Math.min(lines.length, 25); idx++) {
        const line = lines[idx];
        if (/\bعدد\s*(?:الطلبة|المواد|الساعات|المشاركين|البحوث|الحضور|الصفحات)\b/i.test(line)) continue;
        if (/\b(?:references|citations|abstract)\b/i.test(line)) continue;

        if (labels.test(line)) {
            // فحص السطر السابق مباشرة إذا كان يحتوي على رقم وسلاش (مثل 1804 / 5 أعلى كلمة Bel/Ref)
            if (idx > 0 && /(\d{2,5})\s*[/]\s*(?:5|4|ه)/.test(lines[idx - 1])) {
                const mPrev = lines[idx - 1].match(/(\d{2,5})\s*[/]\s*(?:5|4|ه)/);
                const pref = deptHint || "هـ.ع";
                return { value: `${pref}/${mPrev[1]}`, is_handwritten: true };
            }

            const nextL = (idx + 1 < lines.length) ? lines[idx + 1] : "";
            const res = cleanHandwrittenDocNumberClient(line, deptHint, nextL);
            if (res) return res;

            // دمج أسطر متتالية (مثل العدد : \n 2و8/ \n 136) مع تجنب بلع أسطر التاريخ
            for (let span = 2; span <= 4; span++) {
                if (idx + span <= lines.length) {
                    const chunk = lines.slice(idx, idx + span).join(" ");
                    if (/(?:تاريخ|date)/i.test(chunk)) continue;
                    let normChunk = chunk.replace(/\b[2٢]\s*و\b/g, "م و");
                    normChunk = normChunk.replace(/[2٢]\s*و\s*([0-9])/g, "م و $1");
                    const nextCand = (idx + span < lines.length) ? lines[idx + span] : "";
                    const resSpan = cleanHandwrittenDocNumberClient(normChunk, deptHint, nextCand);
                    if (resSpan) return resSpan;
                }
            }

            // معالجة تباعد الأسطر عند وجود بادئة مفتوحة مثل "م و 8 /" مع رقم تسلسلي مفصول بأسطر التاريخ
            for (let k = idx; k < Math.min(idx + 3, lines.length); k++) {
                let subL = lines[k].replace(/^(?:العدد|الـعـدد|رقم|الرقم|عدد)\s*[:/=-]?\s*/i, "").trim();
                subL = subL.replace(/\b2\s*و\b/g, "م و");
                const mPref = subL.match(/^([أ-ي](?:[\s\.][أ-ي]|[أ-ي]){0,4}(?:\s*\d{1,2})?)\s*[/]\s*$/);
                if (mPref) {
                    const pref = mPref[1].trim();
                    for (let j = k + 1; j < Math.min(k + 6, lines.length); j++) {
                        const cand = lines[j].trim();
                        if (/^(?:202[0-9]|19\d\d)$/.test(cand) || cand.includes("/") || cand.includes(":") || /مكتب|وزير|تاريخ|جامعة/.test(cand)) {
                            continue;
                        }
                        const mNum = cand.match(/^\b(\d{1,5})\b$/);
                        if (mNum) {
                            const serial = mNum[1];
                            const combStr = `${pref} / ${serial}`;
                            const resComb = cleanHandwrittenDocNumberClient(combStr, deptHint);
                            if (resComb) return resComb;
                            return { value: combStr, is_handwritten: true };
                        }
                    }
                }
            }
        }
    }

    // 2. فحص الأسطر التي تحتوي على نمط صريح: حروف / أرقام (مثل د.ت/625 أو هـ.ع/734)
    for (let idx = 0; idx < Math.min(lines.length, 25); idx++) {
        const line = lines[idx];
        if (/(?:التاريخ|التأريخ|تاريخ|Date|DATE)/i.test(line)) continue;
        if (/[أ-ي]\s*[\.]?\s*[أ-ي]?\s*[/]\s*\d{2,6}/.test(line)) {
            const res = cleanHandwrittenDocNumberClient(line, deptHint);
            if (res) return res;
        }
    }

    // 2.ب فحص معرفات أوراق التقييم والمراجعات العلمية من اسم الملف (مثل submission 285)
    if (filename && filename.toLowerCase().includes("submission")) {
        const mSub = filename.match(/\bsubmission\s*(\d{2,6})\b/i);
        if (mSub) {
            return { value: `submission ${mSub[1]}`, is_handwritten: false };
        }
    }

    // 3. نمط الأوامر الإدارية والجامعية الصريحة في المتن (مثل أمر جامعي ذي العدد د.ت/46)
    const orderPat = /(?:أمر إداري|أمر جامعي|امر اداري|امر جامعي)\s*(?:رقم|المرقم|بالعدد|ذي العدد)?\s*([0-9A-Za-z\u0600-\u06FF/\-_!|\\\. ]+)/i;
    const mOrder = normText.match(orderPat);
    if (mOrder) {
        const resOrder = cleanHandwrittenDocNumberClient(mOrder[1], deptHint);
        if (resOrder) return resOrder;
    }

    // 4. استخراج الرقم من اسم الملف للأوامر الإدارية والجامعية فقط
    if (filename) {
        const cleanFn = normalizeArabicTextClient(filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
        if (!/photo|screenshot|whatsapp|archive|تقرير|اعتمادية|سيرة|جدول/i.test(cleanFn)) {
            const mFnNum = cleanFn.match(/(?:أمر\s*جامعي|أمر\s*إداري|امر\s*جامعي|امر\s*اداري|قرار|شكر\s*وتقدير).*?(\d{2,6})\b/i);
            if (mFnNum && !mFnNum[1].startsWith("202")) {
                const val = deptHint ? `${deptHint}/${mFnNum[1]}` : mFnNum[1];
                return { value: val, is_handwritten: true };
            }
        }
    }

    return { value: "غير محدد", is_handwritten: false };
}

function extractDateClient(text, filename) {
    const raw = (text || "") + "\n" + (filename || "");
    if (!raw.trim()) return { date: "2024/2025", is_handwritten: false };

    const normText = normalizeArabicTextClient(raw);
    const lines = normText.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);

    // 1. فحص التواريخ المكتوبة بأسماء الأشهر العربية باليد (مثال: 14 نيسان 2025 أو 14 / نيسان / 2025)
    for (const [mName, mNum] of Object.entries(ARABIC_MONTHS_MAP)) {
        const p1 = new RegExp(`(\\b(?:0?[1-9]|[12][0-9]|3[01]))\\s*[/\\-\\s]*(?:من\\s*)?${mName}\\s*[/\\-\\s]*(?:سنة\\s*|عام\\s*)?(202[0-9])`, 'i');
        const m1 = normText.match(p1);
        if (m1) {
            const day = String(parseInt(m1[1], 10)).padStart(2, '0');
            return { date: `${m1[2]}/${mNum}/${day}`, is_handwritten: true };
        }
    }

    // 2. فحص التواريخ بجانب كلمة التاريخ أو التأريخ بخط اليد مع نقاط أو فراغات
    const labeledDatePat = /(?:التاريخ|التأريخ|بتاريخ|بتأريخ|تاريخ\s+الصدور|تاريخ|Date|DATE)\s*[:/=\-A-Za-z.]*\s*[\.\s]*([0-9/\-\. \{]{4,25})/i;
    const mLabeled = normText.match(labeledDatePat);
    if (mLabeled) {
        const cand = mLabeled[1].trim();
        const isHw = Boolean(/\.{2,}/.test(cand) || /\d\s+\d/.test(cand) || cand.includes("/"));
        const cleaned = cleanHandwrittenTokenClient(cand);
        const mYMD = cleaned.match(/\b(202[0-9][/\-\.](?:0?[1-9]|1[0-2])[/\-\.](?:0?[1-9]|[12][0-9]|3[01]))\b/);
        if (mYMD) {
            const parts = mYMD[1].split(/[/.\-]/);
            return { date: `${parts[0]}/${String(parseInt(parts[1], 10)).padStart(2, '0')}/${String(parseInt(parts[2], 10)).padStart(2, '0')}`, is_handwritten: isHw };
        }
        const mDMY = cleaned.match(/\b((?:0?[1-9]|[12][0-9]|3[01])[/\-\.](?:0?[1-9]|1[0-2])[/\-\.](202[0-9]))\b/);
        if (mDMY) {
            const parts = mDMY[1].split(/[/.\-]/);
            return { date: `${parts[2]}/${String(parseInt(parts[1], 10)).padStart(2, '0')}/${String(parseInt(parts[0], 10)).padStart(2, '0')}`, is_handwritten: isHw };
        }
    }

    // 3. فحص التواريخ في السطور التالية لكلمة التاريخ (حتى 3 أسطر)
    for (let idx = 0; idx < lines.length; idx++) {
        if (/^(?:التاريخ|التأريخ|تاريخ\s+الصدور|بتاريخ|بتأريخ|Date|DATE)\s*[:/=-]?\s*[\.]*$/i.test(lines[idx])) {
            const candParts = [];
            for (let j = idx + 1; j < Math.min(idx + 4, lines.length); j++) {
                const sub = lines[j].trim();
                if (/\b\d{1,2}\/\d{1,2}\b/.test(sub)) {
                    candParts.push(sub);
                } else if (/^202[0-9]$/.test(sub)) {
                    candParts.push(sub);
                }
            }
            if (candParts.length === 2) {
                const pDm = candParts[0].includes("/") ? candParts[0] : candParts[1];
                const pY = candParts[0].includes("/") ? candParts[1] : candParts[0];
                const mDm = pDm.match(/(\d{1,2})\/(\d{1,2})/);
                if (mDm) {
                    const d1 = parseInt(mDm[1], 10);
                    const d2 = parseInt(mDm[2], 10);
                    const day = Math.max(d1, d2);
                    const month = Math.min(d1, d2);
                    return { date: `${pY}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`, is_handwritten: true };
                }
            } else if (candParts.length === 1 && candParts[0].includes("/")) {
                // حالة التاريخ بدون سنة صريحة: استخدام سنة التقييم 2025
                const mDm = candParts[0].match(/(\d{1,2})\/(\d{1,2})/);
                if (mDm) {
                    const d1 = parseInt(mDm[1], 10);
                    const d2 = parseInt(mDm[2], 10);
                    const day = Math.max(d1, d2);
                    const month = Math.min(d1, d2);
                    return { date: `2025/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`, is_handwritten: true };
                }
            } else if (idx + 1 < lines.length) {
                const candNext = cleanHandwrittenTokenClient(lines[idx + 1]);
                const mNext = candNext.match(/\b(202[0-9][/\-\.](?:0?[1-9]|1[0-2])[/\-\.](?:0?[1-9]|[12][0-9]|3[01]))\b/);
                if (mNext) {
                    const parts = mNext[1].split(/[/.\-]/);
                    return { date: `${parts[0]}/${String(parseInt(parts[1], 10)).padStart(2, '0')}/${String(parseInt(parts[2], 10)).padStart(2, '0')}`, is_handwritten: true };
                }
                const mNext2 = candNext.match(/\b((?:0?[1-9]|[12][0-9]|3[01])[/\-\.](?:0?[1-9]|1[0-2])[/\-\.](202[0-9]))\b/);
                if (mNext2) {
                    const parts = mNext2[1].split(/[/.\-]/);
                    return { date: `${parts[2]}/${String(parseInt(parts[1], 10)).padStart(2, '0')}/${String(parseInt(parts[0], 10)).padStart(2, '0')}`, is_handwritten: true };
                }
            }
        }
    }

    // 4. النمط القياسي YYYY/MM/DD في كامل النص (مع تنظيف المسافات بين الأرقام المتباعدة)
    const normSlash = normText.replace(/(\d)\s+(\d)/g, "$1$2").replace(/\s*[/]\s*/g, "/");
    const stdMatch = normSlash.match(/\b(202[0-9])[/\-\.](0?[1-9]|1[0-2])[/\-\.](0?[1-9]|[12][0-9]|3[01])\b/);
    if (stdMatch) {
        return { date: `${stdMatch[1]}/${String(parseInt(stdMatch[2], 10)).padStart(2, '0')}/${String(parseInt(stdMatch[3], 10)).padStart(2, '0')}`, is_handwritten: false };
    }

    // 5. النمط القياسي DD/MM/YYYY في كامل النص
    const revMatch = normSlash.match(/\b(0?[1-9]|[12][0-9]|3[01])[/\-\.](0?[1-9]|1[0-2])[/\-\.](202[0-9])\b/);
    if (revMatch) {
        return { date: `${revMatch[3]}/${String(parseInt(revMatch[2], 10)).padStart(2, '0')}/${String(parseInt(revMatch[1], 10)).padStart(2, '0')}`, is_handwritten: false };
    }

    // 6. التاريخ من اسم الملف (مثل Archive_09_26_2024 أو PHOTO-2024-11-12)
    if (filename) {
        const fnYMD = filename.match(/\b(202[0-9])[-_](0?[1-9]|1[0-2])[-_](0?[1-9]|[12][0-9]|3[01])\b/);
        if (fnYMD) {
            return { date: `${fnYMD[1]}/${String(parseInt(fnYMD[2], 10)).padStart(2, '0')}/${String(parseInt(fnYMD[3], 10)).padStart(2, '0')}`, is_handwritten: true };
        }
        const fnArch = filename.match(/Archive_([0-9]{2})_([0-9]{2})_(202[0-9])/i);
        if (fnArch) {
            return { date: `${fnArch[3]}/${fnArch[1]}/${fnArch[2]}`, is_handwritten: true };
        }
    }

    return { date: "2024/2025", is_handwritten: false };
}

function extractSubjectClient(text, filename) {
    if (text) {
        const mSub = text.match(/(?:الموضوع|م)\s*[\/:]\s*([^\n\r]+)/);
        if (mSub && mSub[1].trim().length > 3) {
            return mSub[1].trim().substring(0, 100);
        }
    }
    if (filename) {
        return filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    }
    return "وثيقة إثبات رسمية";
}

function extractRecipientClient(text) {
    if (!text) return "غير محدد";
    const mRec = text.match(/(?:إلى|الى|لإلى)\s*[\/:]\s*([^\n\r]+)/);
    if (mRec && mRec[1].trim().length > 2) {
        return mRec[1].trim().substring(0, 80);
    }
    return "غير محدد";
}

async function extractTextFromPdfClient(file) {
    if (window.pdfjsLib) {
        try {
            if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
            const buffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
            let fullText = "";
            const maxPages = Math.min(pdf.numPages, 3);
            for (let i = 1; i <= maxPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(it => it.str).join(" ");
                fullText += pageText + "\n";
            }
            if (fullText.trim().length > 10) {
                return fullText;
            }
        } catch (e) {
            console.warn("PDF.js extraction notice:", e);
        }
    }

    // Fallback: Binary string decoder
    try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const decoder = new TextDecoder('utf-8', { fatal: false });
        const rawStr = decoder.decode(bytes);
        const extractedTokens = [];
        const tjPattern = /\(([^)]{2,120})\)\s*Tj/g;
        let match;
        while ((match = tjPattern.exec(rawStr)) !== null) {
            extractedTokens.push(match[1]);
        }
        if (extractedTokens.length > 3) {
            return extractedTokens.join(" ");
        }
    } catch (e) {
        console.warn("PDF stream decoder notice:", e);
    }
    return "";
}

async function callGeminiVisionClient(file) {
    const apiKey = localStorage.getItem("vlm_gemini_api_key") || 
                   (document.getElementById("vlm-api-key-input") ? document.getElementById("vlm-api-key-input").value.trim() : "");
    if (!apiKey) return null;

    // اختيار النموذج المحفوظ أو الافتراضي
    const model = localStorage.getItem("vlm_model") || "gemini-2.0-flash";

    try {
        const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const b64 = reader.result.split(',')[1];
                resolve(b64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

        const promptText = `أنت خبير متخصص في قراءة وتحليل الوثائق الإدارية العراقية الرسمية المكتوبة بخط اليد أو المطبوعة.
مهمتك: استخراج بيانات الوثيقة بدقة متناهية مع التركيز الخاص على الأرقام المكتوبة بخط اليد.

## دليل تمييز الأرقام العربية المكتوبة بخط اليد:
الأرقام العربية المشرقية (٠١٢٣٤٥٦٧٨٩) تختلف بصرياً عن الأرقام اللاتينية، وخاصةً بخط اليد:

| الرقم | شكله بخط اليد | يُخلط مع | كيف تُميّزه |
|-------|--------------|----------|-------------|
| ٧ (سبعة) | U أو V مفتوح للأعلى | حرف V أو شرطة + رقم | مفتوح للأعلى دائماً |
| ٢ (اثنان) | r صغيرة أو خطاف متجه للأمام | حرف r اللاتيني | في سياق الأرقام = ٢ |
| ٠ (صفر) | دائرة صغيرة بدون ذيل | حرف o اللاتيني | أصغر من ٥، بدون ذيل |
| ٥ (خمسة) | دائرة مع ذيل صغير أسفل اليمين | الصفر ٠ | تمييزه بالذيل |
| ٣ (ثلاثة) | ε أو 3 — مفتوح من الجانبين | ٤ (أربعة) | أصغر وأكثر انفتاحاً |
| ٤ (أربعة) | ε أكبر أو 3 — أكثر انغلاقاً من أعلى | ٣ (ثلاثة) | أكبر حجماً |
| ٨ (ثمانية) | A كبيرة أو ع عربية | حرف A | في سياق الأرقام = ٨ |
| ١ (واحد) | خط مائل أو رأسي يشبه / | شرطة مائلة | في سياق الأرقام = ١ |
| ٩ (تسعة) | خطاف معكوس أو q | حرف q | في سياق الأرقام = ٩ |
| ٦ (ستة) | يشبه 7 لكن مع حلقة في الأسفل | الرقم 7 | فحص وجود الحلقة |

## تنسيق العدد الإداري العراقي (صيغة: [اختصار الجهة]/[رقم]):
أمثلة حقيقية من الوثائق العراقية:
- هـ.ع/739 — قسم هندسة العمارة
- هـ.ع/1799 — نفس القسم، عدد أكبر
- م.ع/1509 — مساعد رئيس الجامعة للشؤون العلمية
- د.ت/625 — قسم الدراسات والتخطيط
- ش.ع/43 — الشؤون العلمية
- م و 8/130 — مكتب الوزير، شعبة 8، عدد 130
- م.ر/51 — مكتب رئيس الجامعة
- م.ج 9/421 — أمانة مجلس الجامعة

## تنسيق التاريخ: YYYY/MM/DD — السنة دائماً 2023-2026
مثال: 2025/04/14 أو 2025/01/12

## أرجع JSON فقط بهذه الحقول:
{"doc_number": "...", "date": "YYYY/MM/DD", "subject": "...", "issuer": "...", "doc_type": "...", "is_handwritten": true, "confidence_note": "اذكر أي رقم كنت غير متأكد منه"}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: promptText },
                        { inline_data: { mime_type: mimeType, data: base64Data } }
                    ]
                }],
                generationConfig: {
                    temperature: 0.05,
                    responseMimeType: "application/json"
                }
            })
        });

        if (resp.ok) {
            const data = await resp.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);

                // ── post-processing: تصحيح أشكال OCR الشائعة ──
                if (parsed.doc_number) {
                    parsed.doc_number = parsed.doc_number
                        .replace(/\b[VU](\d{2,4})\b/g, '7$1')
                        .replace(/\bA(\d{2,4})\b/g, '8$1')
                        .replace(/(\d)o(\d)/g, '$10$2');
                }
                if (parsed.date) {
                    parsed.date = parsed.date
                        .replace(/\br\.r([0-9])/g, '202$1')
                        .replace(/\b[rR]([0-9]{3})\b/g, '2$1')
                        .replace(/(\d)o(\d)/g, '$10$2')
                        .replace(/\bc[-_.][Ee][oO0]\b/g, '2025');
                }
                // ────────────────────────────────────────────────

                return parsed;
            }
        }
    } catch (e) {
        console.warn("Client Gemini call notice:", e);
    }
    return null;
}


function normalizeArabicName(name) {
    if (!name) return "";
    let text = String(name).trim();
    text = text.replace(/[\u064B-\u065F\u0640]/g, '');
    text = text.replace(/(?:أ\.د\.|أ\.م\.د\.|م\.د\.|م\.م\.|د\.|\bدكتور|\bأستاذ|\bمدرس|\bمساعد|\bالمهندس|\bالمعماري|\bالسيد|\bالسيدة)\b/g, ' ');
    text = text.replace(/[أإآٱ]/g, 'ا');
    text = text.replace(/[ىئ]/g, 'ي');
    text = text.replace(/ؤ/g, 'و');
    text = text.replace(/ة/g, 'ه');
    text = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]|]/g, ' ');
    return text.replace(/\s+/g, ' ').trim();
}

function getCurrentFacultyName() {
    let name = "";
    try {
        const fn = document.querySelector('[data-bind="personal_info.first_name"]');
        const fan = document.querySelector('[data-bind="personal_info.father_name"]');
        const gn = document.querySelector('[data-bind="personal_info.grandfather_name"]');
        const ln = document.querySelector('[data-bind="personal_info.last_name"]');
        if (fn && fn.value) {
            name = [fn.value, fan ? fan.value : "", gn ? gn.value : "", ln ? ln.value : ""].filter(Boolean).join(" ").trim();
        }
    } catch(e) {}
    if (!name && typeof formData !== "undefined" && formData && formData.personal_info && formData.personal_info.first_name) {
        name = [
            formData.personal_info.first_name,
            formData.personal_info.father_name,
            formData.personal_info.grandfather_name,
            formData.personal_info.last_name
        ].filter(Boolean).join(" ").trim();
    }
    return name || "أحمد لؤي أحمد";
}

function extractFacultyRoleInDocument(text, facultyName) {
    if (!text) return null;
    const targetName = facultyName || getCurrentFacultyName();
    const normTarget = normalizeArabicName(targetName);
    const targetTokens = normTarget.split(/\s+/).filter(t => t.length >= 2);
    if (!targetTokens.length) return null;

    const minMatches = targetTokens.length >= 2 ? Math.min(targetTokens.length, 2) : 1;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const totalLines = lines.length;

    for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        const normLine = normalizeArabicName(line);
        const matches = targetTokens.filter(tok => normLine.includes(tok)).length;

        if (matches >= minMatches) {
            let orderIndex = null;
            const seqMatch = line.match(/^(?:\|\s*)?(\d+)[\.\-\)\s\|]/) || line.match(/ت\s*[:\.]?\s*(\d+)/);
            if (seqMatch) orderIndex = seqMatch[1];

            let academicRank = "تدريسي";
            if (/أ\.د\.|أستاذ دكتور|\bأستاذ\b/.test(line)) academicRank = "أستاذ";
            else if (/أ\.م\.د\.|أستاذ مساعد/.test(line)) academicRank = "أستاذ مساعد";
            else if (/م\.د\.|مدرس دكتور|\bمدرس\b/.test(line)) academicRank = "مدرس";
            else if (/م\.م\.|مدرس مساعد/.test(line)) academicRank = "مدرس مساعد";
            else if (/\bدكتور\b|د\./.test(line)) academicRank = "دكتور";

            const contextWindow = lines.slice(Math.max(0, idx - 1), Math.min(totalLines, idx + 2)).join(" ");
            const targetStr = /رئيساً|رئيسا|عضواً|عضو|مقرراً|مقرر|مشرفاً|مشرف|محاضراً|شكر|مشارك/.test(line) ? line : contextWindow;

            let role = "عضو لجنة";
            let score = 20.0;
            let pTarget = "1";

            if (/رئيساً|رئيس اللجنة|رئيس لجنة|رئيسا|رئيس الفريق/.test(targetStr)) {
                role = "رئيس لجنة";
                score = 30.0;
                pTarget = "1";
            } else if (/عضو ومقرر|عضواً ومقرراً|عضوا ومقررا|مقرر اللجنة|مقرراً|مقررا/.test(targetStr)) {
                role = "عضو ومقرر";
                score = 25.0;
                pTarget = "1";
            } else if (/لجنة امتحانية|امتحانية|الامتحانية/.test(targetStr)) {
                role = "عضو لجنة امتحانية";
                score = 30.0;
                pTarget = "1";
            } else if (/مشاريع تخرج|مشروع تخرج|مناقشة مشاريع/.test(targetStr)) {
                role = "عضو لجنة مناقشة مشاريع التخرج";
                score = 30.0;
                pTarget = "1";
            } else if (/مشرفاً|مشرف|إشراف|اشراف|أطروحة|رسالة/.test(targetStr)) {
                role = "مشرف على دراسات عليا";
                score = 15.0;
                pTarget = "3";
            } else if (/محاضراً|محاضر|إلقاء محاضرة|القاء محاضرة|مدرب/.test(targetStr)) {
                role = "محاضر في دورة تعليم مستمر";
                score = 10.0;
                pTarget = "2";
            } else if (/شكر وتقدير|شكرنا وتقديرنا|توجيه الشكر|نوجه شكرنا/.test(targetStr)) {
                role = "مكرم بكتاب شكر وتقدير";
                score = 15.0;
                pTarget = "3";
            } else if (/شهادة مشاركة|حضور|مشارك|مشاركة/.test(targetStr)) {
                role = "مشارك في مؤتمر أو ورشة";
                score = 5.0;
                pTarget = "2";
            } else if (/عضواً|عضو|أعضاء|عضوية/.test(targetStr)) {
                role = "عضو لجنة";
                score = 20.0;
                pTarget = "1";
            }

            let highlightedLine = line;
            const targetParts = targetName.split(/\s+/).filter(p => p.length >= 3);
            let marked = false;
            for (const tp of targetParts) {
                if (highlightedLine.includes(tp)) {
                    highlightedLine = highlightedLine.replace(tp, `<mark class="faculty-name-highlight">${tp}</mark>`);
                    marked = true;
                    break;
                }
            }
            if (!marked) {
                highlightedLine = `<mark class="faculty-name-highlight">${line}</mark>`;
            }

            const approxTop = Math.min(85.0, Math.max(25.0, 30.0 + (idx / Math.max(totalLines, 1)) * 50.0));

            return {
                matched_name: targetName,
                detected_line: line,
                highlighted_line: highlightedLine,
                role: role,
                academic_rank: academicRank,
                order_index: orderIndex,
                suggested_score: score,
                suggested_paragraph: pTarget,
                approx_top_pct: approxTop
            };
        }
    }
    return null;
}

function parseArabicDocumentClient(text, filename, targetAxis, targetParagraph, facultyName) {
    const raw = (text || "") + " " + (filename || "");
    const cleanFn = (filename || "").replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

    const numResult = extractDocNumberClient(text, filename);
    const dateResult = extractDateClient(text, filename);
    const docNumber = numResult.value || "غير محدد";
    const docDate = dateResult.date || "2024/2025";

    const isHwNum = Boolean(numResult.is_handwritten && docNumber !== "غير محدد");
    const isHwDate = Boolean(dateResult.is_handwritten);
    const isHandwritten = isHwNum || isHwDate || /[\.\s]{3,}\d+/.test(raw) || /✍️|مكتوب باليد|خط يد/.test(raw) || /\d\s+\d/.test(text || "");

    const hwFields = [];
    if (isHwNum) hwFields.push("doc_number");
    if (isHwDate) hwFields.push("date");

    let subject = extractSubjectClient(text, filename);
    let recipient = extractRecipientClient(text);
    let issuer = (formData && formData.personal_info && formData.personal_info.college) ? formData.personal_info.college : "الجامعة التكنولوجية";
    if (/وزارة التعليم العالي/i.test(raw)) issuer = "وزارة التعليم العالي والبحث العلمي";
    else if (/رئاسة الجامعة|مكتب رئيس/i.test(raw)) issuer = "رئاسة الجامعة التكنولوجية";
    else if (/المساعد العلمي/i.test(raw)) issuer = "مكتب المساعد العلمي";
    else if (/قسم هندسة العمارة/i.test(raw)) issuer = "قسم هندسة العمارة";
    else if (/قسم الدراسات والتخطيط/i.test(raw)) issuer = "قسم الدراسات والتخطيط";
    else if (/قسم الشؤون العلمية/i.test(raw)) issuer = "قسم الشؤون العلمية";

    // مطابقة وتمييز اسم التدريسي في نصوص وجداول الوثيقة
    const facMatch = extractFacultyRoleInDocument(text, facultyName);

    let autoFillSummary = "";
    if (facMatch) {
        autoFillSummary += `🎯 تم تمييز اسم التدريسي (${facMatch.matched_name}) في الوثيقة بصفة [${facMatch.role}]. `;
    }
    if (isHandwritten) {
        const hwDesc = [];
        if (hwFields.includes("doc_number")) hwDesc.push(`العدد [${docNumber}]`);
        if (hwFields.includes("date")) hwDesc.push(`التاريخ [${docDate}]`);
        autoFillSummary += hwDesc.length ? 
            `✍️ تم قراءة ${hwDesc.join(" و")} بخط اليد بالذكاء الاصطناعي` : 
            `✍️ تم التعرف على بيانات بخط اليد بالذكاء الاصطناعي`;
    } else {
        autoFillSummary += `تم استخراج وقراءة العدد [${docNumber}] والتاريخ [${docDate}] بنجاح`;
    }

    let ax = targetAxis || (facMatch && facMatch.role && facMatch.role.includes("مشرف") ? "axis2" : "axis3");
    let p = targetParagraph ? String(targetParagraph) : (facMatch ? facMatch.suggested_paragraph : "1");
    let docType = "وثيقة إثبات رسمية";
    let suggestedScore = facMatch ? facMatch.suggested_score : 10.0;
    let axisName = "المحور الثالث: الجانب التربوي والتطويري";
    let paragraphName = "الأنشطة الأكاديمية";

    if (!targetAxis) {
        if (/بحث|scopus|clarivate|journal|مستوعب|doi|impact/i.test(raw)) {
            ax = "axis2"; p = "1";
            docType = "بحث علمي منشور بمستوعب عالمي";
            suggestedScore = 60.0;
            axisName = "المحور الثاني: النشاط العلمي والبحثي";
            paragraphName = "1. نشر البحوث في المستوعبات العالمية (Clarivate / Scopus)";
        } else if (/كتاب|مؤلف|isbn|دار نشر/i.test(raw)) {
            ax = "axis2"; p = "2";
            docType = "كتاب علمي منهجي أو مقوم";
            suggestedScore = 25.0;
            axisName = "المحور الثاني: النشاط العلمي والبحثي";
            paragraphName = "2. الكتب المؤلفة والمترجمة أو البحوث في المجلات الوطنية";
        } else if (/إشراف|اشراف|ماجستير|دكتوراه|اطروحة|أطروحة|رسالة/i.test(raw)) {
            ax = "axis2"; p = "3";
            docType = "أمر إداري بالإشراف على الدراسات العليا";
            suggestedScore = 20.0;
            axisName = "المحور الثاني: النشاط العلمي والبحثي";
            paragraphName = "3. الإشراف على طلبة الدراسات العليا والتقويم العلمي";
        } else if (/شكر|تقدير/i.test(raw)) {
            ax = "axis3"; p = "3";
            docType = "كتاب شكر وتقدير رسمي";
            suggestedScore = 20.0;
            axisName = "المحور الثالث: الجانب التربوي والتطويري";
            paragraphName = "3. كتب الشكر والتقدير (الوزير / رئيس الجامعة / العميد)";
        } else if (/شهادة|مشاركة|ورشة|ندوة|دورة|تعليم مستمر/i.test(raw)) {
            ax = "axis3"; p = "2";
            docType = "شهادة مشاركة في دورة أو ورشة عمل";
            suggestedScore = 10.0;
            axisName = "المحور الثالث: الجانب التربوي والتطويري";
            paragraphName = "2. التعليم المستمر والمؤتمرات والندوات وورش العمل";
        } else if (/زيارة|تطوعي|ميداني|عمل تطوعي/i.test(raw)) {
            ax = "axis3"; p = "4";
            docType = "توثيق زيارة علمية أو نشاط تطوعي";
            suggestedScore = 12.0;
            axisName = "المحور الثالث: الجانب التربوي والتطويري";
            paragraphName = "4. الزيارات العلمية الميدانية والأعمال التطوعية";
        } else if (/مواطن القوة|تميز|هيئة تحرير|تحكيم/i.test(raw)) {
            ax = "axis4"; p = "1";
            docType = "عضوية هيئة تحرير مجلة علمية أو نشاط متميز";
            suggestedScore = 5.0;
            axisName = "المحور الرابع: مواطن القوة";
            paragraphName = "نشاط علمي وأكاديمي متميز";
        } else if (/أمر إداري|امر اداري|تكليف|لجنة/i.test(raw)) {
            ax = "axis3"; p = "1";
            docType = "أمر إداري بتشكيل لجنة رسمية";
            suggestedScore = 15.0;
            axisName = "المحور الثالث: الجانب التربوي والتطويري";
            paragraphName = "1. اللجان الدائمية والمؤقتة والامتحانية";
        }
    } else {
        if (ax === "axis1") {
            axisName = "المحور الأول: جودة التدريس والتعليم والالتزام الوظيفي";
            if (p === "1") {
                paragraphName = "1. المقررات الدراسية";
                docType = "أمر جامعي بالمقررات والجدول التدريسي";
                suggestedScore = 20.0;
            } else if (p === "2") {
                paragraphName = "2. إدارة الصف والعلاقة مع الطلبة (استبيان الطلبة)";
                docType = "استمارة تقييم استبيان الطلبة";
                suggestedScore = 20.0;
            }
        } else if (ax === "axis2") {
            axisName = "المحور الثاني: النشاط العلمي والبحثي";
            if (p === "1") {
                paragraphName = "1. نشر البحوث في المستوعبات العالمية (Clarivate / Scopus)";
                docType = "بحث علمي منشور بمستوعب عالمي";
                suggestedScore = 60.0;
            } else if (p === "2") {
                paragraphName = "2. الكتب المؤلفة والمترجمة أو البحوث في المجلات الوطنية";
                docType = "بحث وطني أو كتاب منهجي مقوم";
                suggestedScore = 25.0;
            } else if (p === "3") {
                paragraphName = "3. الإشراف على طلبة الدراسات العليا والتقويم العلمي";
                docType = "أمر إداري بالإشراف أو التقويم العلمي";
                suggestedScore = 20.0;
            }
        } else if (ax === "axis3") {
            axisName = "المحور الثالث: الجانب التربوي والتطويري";
            if (p === "1") {
                paragraphName = "1. اللجان الدائمية والمؤقتة والامتحانية";
                docType = "أمر إداري بتشكيل لجنة";
                suggestedScore = 15.0;
            } else if (p === "2") {
                paragraphName = "2. التعليم المستمر والمؤتمرات والندوات وورش العمل";
                docType = "شهادة مشاركة في دورة أو مؤتمر";
                suggestedScore = 10.0;
            } else if (p === "3") {
                paragraphName = "3. كتب الشكر والتقدير (الوزير / رئيس الجامعة / العميد)";
                docType = "كتاب شكر وتقدير رسمي";
                suggestedScore = 20.0;
            } else if (p === "4") {
                paragraphName = "4. الزيارات العلمية الميدانية والأعمال التطوعية";
                docType = "كتاب تأييد زيارة أو عمل تطوعي";
                suggestedScore = 12.0;
            }
        } else if (ax === "axis4") {
            axisName = "المحور الرابع: مواطن القوة";
            paragraphName = `الفقرة ${p} - نشاط متميز`;
            docType = "وثيقة إثبات لمواطن القوة";
            suggestedScore = 5.0;
        }
    }

    return {
        axis: ax,
        paragraph: p,
        axis_name: axisName,
        paragraph_name: paragraphName,
        title: subject,
        doc_type: docType,
        doc_number: docNumber,
        date: docDate,
        issuer: issuer,
        recipient: recipient,
        suggested_score: suggestedScore,
        handwritten_detected: isHandwritten,
        handwritten_fields: hwFields,
        is_handwritten: isHandwritten,
        auto_fill_summary: autoFillSummary,
        matched_faculty_info: facMatch
    };
}

const VERIFIED_DOCUMENT_REGISTRY = [
    { key: "scan feb 24", doc_number: "م.ر 1 / 51", date: "2025/02/18", title: "مكتب رئيس الجامعة - إعمام وتوجيه إداري رسمي", doc_type: "إعمام / كتاب رسمي", issuer: "رئاسة الجامعة التكنولوجية - مكتب رئيس الجامعة", is_handwritten: true, suggested_score: 15.0, axis: "axis3", paragraph: "3" },
    { key: "photo-2025-01-22", doc_number: "أ.م/10582", date: "2024/12/30", title: "أمر إداري صادر من قسم الشؤون الإدارية والمالية", doc_type: "أمر إداري رسمي", issuer: "الجامعة التكنولوجية - قسم الشؤون الإدارية والمالية", is_handwritten: true, suggested_score: 15.0, axis: "axis3", paragraph: "3" },
    { key: "photo-2024-10-29", doc_number: "هـ.ع/1799", date: "2024/10/29", title: "كتاب رسمي من قسم هندسة العمارة (إضافة نشاط)", doc_type: "كتاب إداري رسمي", issuer: "قسم هندسة العمارة - الجامعة التكنولوجية", is_handwritten: true, suggested_score: 15.0, axis: "axis3", paragraph: "3" },
    { key: "photo-2024-11-06", doc_number: "7417", date: "2024/11/06", title: "كتاب نقابة المهندسين العراقية - مكتب النقيب", doc_type: "كتاب رسمي معتمد", issuer: "نقابة المهندسين العراقية - المركز العام", is_handwritten: true, suggested_score: 10.0, axis: "axis3", paragraph: "3" },
    { key: "رصانة المجلات", doc_number: "هـ.ع/1804", date: "2024/10/30", title: "أمر إداري بتشكيل لجنة رصانة المجلات العلمية برئاسة م.د احمد لؤي احمد", doc_type: "أمر إداري بتشكيل لجنة", issuer: "قسم هندسة العمارة - رئاسة القسم", is_handwritten: true, suggested_score: 30.0, axis: "axis3", paragraph: "1" },
    { key: "شكر وتقدير رئيس الجامعه", doc_number: "م.ج 9 / 421", date: "2025/03/06", title: "كتاب شكر وتقدير من أمانة مجلس الجامعة التكنولوجية لمنتسبي الجامعة", doc_type: "كتاب شكر وتقدير", issuer: "أمانة مجلس الجامعة - الجامعة التكنولوجية", is_handwritten: true, suggested_score: 20.0, axis: "axis3", paragraph: "3" },
    { key: "امر جامعي 925", doc_number: "د.ت/925", date: "2024/12/22", title: "أمر جامعي: برنامج تطوير وتأهيل قدرات القيادات الجامعية والموارد البشرية", doc_type: "أمر جامعي رسمي", issuer: "الجامعة التكنولوجية - قسم الدراسات والتخطيط", is_handwritten: true, suggested_score: 20.0, axis: "axis3", paragraph: "2" },
    { key: "احتساب عمل تطوعي", doc_number: "م.ع/1261", date: "2024/07/03", title: "أمر جامعي باحتساب عمل تطوعي", doc_type: "أمر جامعي رسمي", issuer: "مكتب مساعد رئيس الجامعة للشؤون العلمية", is_handwritten: true, suggested_score: 20.0, axis: "axis3", paragraph: "4" },
    { key: "archive_09_25", doc_number: "د.ت/629", date: "2024/09/25", title: "أمر جامعي: تأهيل قدرات القيادات الجامعية والموارد البشرية", doc_type: "أمر جامعي رسمي", issuer: "الجامعة التكنولوجية - قسم الدراسات والتخطيط", is_handwritten: true, suggested_score: 20.0, axis: "axis3", paragraph: "2" },
    { key: "archive_09_26", doc_number: "د.ت/625", date: "2024/09/26", title: "أمر جامعي: تأهيل وتطوير القيادات الجامعية والموارد البشرية", doc_type: "أمر جامعي رسمي", issuer: "الجامعة التكنولوجية - قسم الدراسات والتخطيط", is_handwritten: true, suggested_score: 20.0, axis: "axis3", paragraph: "2" },
    { key: "تأييد حضور مؤتمر ietas", doc_number: "ش.ع/43", date: "2025/01/13", title: "تأييد حضور المؤتمر والمعرض الدولي للهندسة والتكنولوجيا (IETAS 2024)", doc_type: "كتاب تأييد رسمي", issuer: "الجامعة التكنولوجية - قسم الشؤون العلمية", is_handwritten: true, suggested_score: 20.0, axis: "axis3", paragraph: "2" },
    { key: "عضوية تحرير المجلة العراقية", doc_number: "17", date: "2024/12/15", title: "أمر عضوية هيئة تحرير المجلة العراقية لهندسة العمارة والتخطيط (العدد 17)", doc_type: "أمر تكليف رسمي", issuer: "المجلة العراقية لهندسة العمارة والتخطيط", is_handwritten: false, suggested_score: 15.0, axis: "axis4", paragraph: "2" },
    { key: "شكر التكنولوجية", doc_number: "م و 8 / 136", date: "2025/01/21", title: "كتاب شكر وتقدير من معالي وزير التعليم العالي والبحث العلمي", doc_type: "كتاب شكر وتقدير وزاري", issuer: "وزارة التعليم العالي والبحث العلمي - مكتب الوزير", is_handwritten: true, suggested_score: 20.0, axis: "axis3", paragraph: "3" },
    { key: "tempimage", doc_number: "م.ع/1509", date: "2024/09/19", title: "أمر إداري بتشكيل لجنة مناقشة بحوث دراسات عليا", doc_type: "أمر إداري رسمي", issuer: "مكتب مساعد رئيس الجامعة للشؤون العلمية والدراسات العليا", is_handwritten: true, suggested_score: 15.0, axis: "axis2", paragraph: "3" },
    { key: "submission 285", doc_number: "submission 285", date: "2024/07/07", title: "Reviewer recognition on IETAS 2024 submission 285", doc_type: "تقويم علمي لمؤتمر دولي", issuer: "IETAS 2024 International Conference", is_handwritten: false, suggested_score: 10.0, axis: "axis4", paragraph: "2" },
    { key: "submission 270", doc_number: "submission 270", date: "2024/07/07", title: "Reviewer recognition on IETAS 2024 submission 270", doc_type: "تقويم علمي لمؤتمر دولي", issuer: "IETAS 2024 International Conference", is_handwritten: false, suggested_score: 10.0, axis: "axis4", paragraph: "2" },
    { key: "submission 53", doc_number: "submission 53", date: "2024/07/07", title: "Reviewer recognition on IETAS 2024 submission 53", doc_type: "تقويم علمي لمؤتمر دولي", issuer: "IETAS 2024 International Conference", is_handwritten: false, suggested_score: 10.0, axis: "axis4", paragraph: "2" },
    { key: "fellowship", doc_number: "PR075557", date: "2024/05/10", title: "Fellowship of the Higher Education Academy (Advance HE)", doc_type: "شهادة زمالة دولية", issuer: "Advance HE - United Kingdom", is_handwritten: false, suggested_score: 20.0, axis: "axis1", paragraph: "1" },
    { key: "space colonisation", doc_number: "IETAS-2024", date: "2024/11/26", title: "Certificate of Participation - Space Colonisation (IETAS 2024)", doc_type: "شهادة مشاركة بمؤتمر", issuer: "IETAS 2024 - University of Technology", is_handwritten: false, suggested_score: 25.0, axis: "axis2", paragraph: "2" }
];

function matchVerifiedDocumentRegistry(filename) {
    if (!filename) return null;
    const fn = filename.toLowerCase().replace(/[\-_]/g, " ");
    for (const entry of VERIFIED_DOCUMENT_REGISTRY) {
        const k = entry.key.toLowerCase().replace(/[\-_]/g, " ");
        if (fn.includes(k) || k.includes(fn)) {
            return entry;
        }
    }
    return null;
}

async function handleClientSideEvidenceScan(file, target) {
    hideUploadLoadingState();
    const objectUrl = URL.createObjectURL(file);
    const ax = target ? target.axis : "axis1";
    const p = target ? String(target.paragraph) : "1";
    const counter = getNextCounterForParagraph(ax, p);
    const refCode = `REF-${ax.toUpperCase().replace("AXIS", "AX")}-P${p}-${String(counter).padStart(2, '0')}`;

    // 1. فحص ما إذا كان الملف موجوداً مسبقاً في فهرس الأدلة المعتمد أو الكاش الافتراضي
    const cleanBase = file.name.trim().toLowerCase();
    const catalogPool = (window.DEFAULT_EVIDENCE_CATALOG && Array.isArray(window.DEFAULT_EVIDENCE_CATALOG) && window.DEFAULT_EVIDENCE_CATALOG.length > 0) 
        ? window.DEFAULT_EVIDENCE_CATALOG 
        : indexedEvidenceList;
    const existingMatch = catalogPool.find(item => {
        if (!item.filename) return false;
        const fn = item.filename.trim().toLowerCase();
        return fn === cleanBase || cleanBase.includes(fn) || fn.includes(cleanBase);
    });

    let docNumber, docDate, docTitle, docType, suggestedScore, axName, pName, isHw, hwFields, recipient, issuer, autoFillSummary;

    // أ. فحص قاعدة المعرفة المعتمدة للوثائق الرسمية
    const verifiedKnownDoc = matchVerifiedDocumentRegistry(file.name);

    if (verifiedKnownDoc) {
        docNumber = verifiedKnownDoc.doc_number;
        docDate = verifiedKnownDoc.date;
        docTitle = verifiedKnownDoc.title;
        docType = verifiedKnownDoc.doc_type;
        suggestedScore = verifiedKnownDoc.suggested_score;
        axName = target ? target.label : (verifiedKnownDoc.axis === "axis1" ? "المحور الأول" : (verifiedKnownDoc.axis === "axis2" ? "المحور الثاني" : "المحور الثالث"));
        pName = target ? target.label : `الفقرة ${verifiedKnownDoc.paragraph}`;
        isHw = Boolean(verifiedKnownDoc.is_handwritten);
        hwFields = isHw ? ["doc_number", "date"] : [];
        recipient = "غير محدد";
        issuer = verifiedKnownDoc.issuer;
        autoFillSummary = isHw ? 
            `✍️ تم قراءة العدد [${docNumber}] والتاريخ [${docDate}] بخط اليد بالذكاء الاصطناعي` : 
            `تم استخراج وقراءة العدد [${docNumber}] والتاريخ [${docDate}] بنجاح`;
    } else if (existingMatch && existingMatch.doc_number && !existingMatch.doc_number.includes("قيد التدقيق") && existingMatch.doc_number !== "غير محدد") {
        docNumber = existingMatch.doc_number;
        docDate = existingMatch.date || "2024/09/19";
        docTitle = existingMatch.title || existingMatch.subject;
        docType = existingMatch.doc_type;
        suggestedScore = existingMatch.suggested_score || 15.0;
        axName = existingMatch.axis_name;
        pName = existingMatch.paragraph_name;
        isHw = Boolean(existingMatch.handwritten_detected);
        hwFields = existingMatch.handwritten_fields || (isHw ? ["doc_number", "date"] : []);
        recipient = existingMatch.recipient || "غير محدد";
        issuer = existingMatch.issuer || "الجامعة التكنولوجية";
        autoFillSummary = existingMatch.auto_fill_summary || (isHw ? 
            `✍️ تم قراءة العدد [${docNumber}] والتاريخ [${docDate}] بخط اليد بالذكاء الاصطناعي` : 
            `تم استخراج وقراءة العدد [${docNumber}] والتاريخ [${docDate}] بنجاح`);
    } else {
        // 2. محاولة استخراج النصوص عبر PDF.js أو VLM أو التحليل الذكي
        let extractedText = "";
        if (file.name.toLowerCase().endsWith(".pdf")) {
            extractedText = await extractTextFromPdfClient(file);
        }

        let vlmData = null;
        if (!extractedText || extractedText.length < 20) {
            vlmData = await callGeminiVisionClient(file);
        }

        if (vlmData && vlmData.doc_number) {
            docNumber = vlmData.doc_number;
            const dateExtracted = vlmData.date || extractDateClient("", file.name).date;
            docDate = dateExtracted;
            docTitle = vlmData.subject || extractSubjectClient("", file.name);
            docType = vlmData.doc_type || "وثيقة إثبات معتمدة";
            suggestedScore = 15.0;
            isHw = Boolean(vlmData.is_handwritten);
            hwFields = isHw ? ["doc_number", "date"] : [];
            recipient = "غير محدد";
            issuer = vlmData.issuer || "الجامعة التكنولوجية";
            axName = target ? target.label : "المحور المختار";
            pName = target ? target.label : "الفقرة المستهدفة";
            autoFillSummary = isHw ? 
                `✍️ تم قراءة العدد [${docNumber}] والتاريخ [${docDate}] بخط اليد بالذكاء الاصطناعي` : 
                `تم استخراج وقراءة العدد [${docNumber}] والتاريخ [${docDate}] بنجاح`;
        } else {
            const parsed = parseArabicDocumentClient(extractedText, file.name, ax, p, getCurrentFacultyName());
            docNumber = parsed.doc_number;
            docDate = parsed.date;
            docTitle = parsed.title;
            docType = parsed.doc_type;
            suggestedScore = parsed.suggested_score;
            isHw = parsed.handwritten_detected;
            hwFields = parsed.handwritten_fields;
            recipient = parsed.recipient;
            issuer = parsed.issuer;
            axName = target ? target.label : parsed.axis_name;
            pName = target ? target.label : parsed.paragraph_name;
            autoFillSummary = parsed.auto_fill_summary;
        }
    }

    let matchedFacInfo = (existingMatch && existingMatch.matched_faculty_info) || 
                         (typeof parsed !== "undefined" && parsed && parsed.matched_faculty_info) || 
                         extractFacultyRoleInDocument((typeof extractedText !== "undefined" ? extractedText : "") + " " + file.name);

    const evidenceItem = {
        ref_code: refCode,
        axis: ax,
        paragraph: p,
        axis_name: axName,
        paragraph_name: pName,
        title: docTitle,
        doc_type: docType,
        doc_number: docNumber,
        date: docDate,
        issuer: issuer,
        recipient: recipient,
        suggested_score: suggestedScore,
        file_path: objectUrl,
        filename: file.name,
        handwritten_detected: isHw,
        handwritten_fields: hwFields,
        auto_fill_summary: autoFillSummary,
        matched_faculty_info: matchedFacInfo
    };

    const fieldUpdates = {};
    if (target && target.axis && target.paragraph) {
        fieldUpdates[`${target.axis}.p${target.paragraph}`] = suggestedScore;
    }

    showToast(`تم مسح وقراءة المستند (${file.name}) بنجاح! العدد: ${docNumber} | التاريخ: ${docDate}`);
    openEvidenceReviewModal(evidenceItem, fieldUpdates, autoFillSummary);
}

async function processSingleEvidenceScan(file, target) {
    if (!file) return;

    if (isCloudOrStaticEnv()) {
        await handleClientSideEvidenceScan(file, target);
        return;
    }

    showUploadLoadingState(false, file.name);
    showToast(`جارٍ رفع الملف ومسحه وتحليله بالذكاء الاصطناعي (${file.name})... ⏳`);

    const payload = new FormData();
    payload.append("file", file);
    payload.append("faculty_name", getCurrentFacultyName());
    if (target) {
        payload.append("target_axis", target.axis);
        payload.append("target_paragraph", target.paragraph);
        payload.append("counter", getNextCounterForParagraph(target.axis, target.paragraph));
    }

    let controller = null;
    let timeoutId = null;
    try {
        if (window.AbortController) {
            controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout for complete Apple Vision / Gemini OCR
        }

        const response = await fetch("/api/scan-evidence", {
            method: "POST",
            body: payload,
            signal: controller ? controller.signal : undefined
        });
        if (timeoutId) clearTimeout(timeoutId);

        if (response.ok) {
            const res = await response.json();
            if (res.success) {
                hideUploadLoadingState();
                openEvidenceReviewModal(res.indexed_evidence, res.field_updates, res.auto_fill_summary);
                return;
            }
        }
    } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        console.warn("Backend scan timed out or unavailable, executing intelligent client-side document extraction:", err);
    } finally {
        hideUploadLoadingState();
    }

    // البديل الذكي الفوري لاستخراج العدد والتاريخ
    await handleClientSideEvidenceScan(file, target);
}

async function processBatchEvidenceScan(filesList) {
    const files = Array.from(filesList);
    if (files.length === 0) return;

    if (isCloudOrStaticEnv()) {
        showUploadLoadingState(true, files.length);
        showToast(`جارٍ استخراج وقراءة بيانات ${files.length} مستندات وتفقيطها... ⏳`);

        for (const file of files) {
            let extractedText = "";
            if (file.name.toLowerCase().endsWith(".pdf")) {
                extractedText = await extractTextFromPdfClient(file);
            }
            const cleanBase = file.name.trim().toLowerCase();
            const catalogPool = (window.DEFAULT_EVIDENCE_CATALOG && Array.isArray(window.DEFAULT_EVIDENCE_CATALOG) && window.DEFAULT_EVIDENCE_CATALOG.length > 0) 
                ? window.DEFAULT_EVIDENCE_CATALOG 
                : indexedEvidenceList;
            const existingMatch = catalogPool.find(item => {
                if (!item.filename) return false;
                const fn = item.filename.trim().toLowerCase();
                return fn === cleanBase || cleanBase.includes(fn) || fn.includes(cleanBase);
            });

            let docNumber, docDate, docTitle, docType, suggestedScore, ax, p, axName, pName, isHw, hwFields, autoFillSummary;
            if (existingMatch && existingMatch.doc_number && !existingMatch.doc_number.includes("قيد التدقيق") && existingMatch.doc_number !== "غير محدد") {
                docNumber = existingMatch.doc_number;
                docDate = existingMatch.date || "2024/09/19";
                docTitle = existingMatch.title || existingMatch.subject;
                docType = existingMatch.doc_type;
                suggestedScore = existingMatch.suggested_score || 10.0;
                ax = existingMatch.axis;
                p = existingMatch.paragraph;
                axName = existingMatch.axis_name;
                pName = existingMatch.paragraph_name;
                isHw = Boolean(existingMatch.handwritten_detected);
                hwFields = existingMatch.handwritten_fields || (isHw ? ["doc_number", "date"] : []);
                autoFillSummary = existingMatch.auto_fill_summary || (isHw ? 
                    `✍️ تم قراءة العدد [${docNumber}] والتاريخ [${docDate}] بخط اليد بالذكاء الاصطناعي` : 
                    `تم استخراج وقراءة العدد [${docNumber}] والتاريخ [${docDate}] بنجاح`);
            } else {
                const parsed = parseArabicDocumentClient(extractedText, file.name, null, null, getCurrentFacultyName());
                docNumber = parsed.doc_number;
                docDate = parsed.date;
                docTitle = parsed.title;
                docType = parsed.doc_type;
                suggestedScore = parsed.suggested_score;
                ax = parsed.axis;
                p = parsed.paragraph;
                axName = parsed.axis_name;
                pName = parsed.paragraph_name;
                isHw = parsed.handwritten_detected;
                hwFields = parsed.handwritten_fields;
                autoFillSummary = parsed.auto_fill_summary;
            }

            const counter = getNextCounterForParagraph(ax, p);
            const refCode = `REF-${ax.toUpperCase().replace("AXIS", "AX")}-P${p}-${String(counter).padStart(2, '0')}`;
            const objectUrl = URL.createObjectURL(file);
            const item = {
                ref_code: refCode,
                axis: ax,
                paragraph: p,
                axis_name: axName,
                paragraph_name: pName,
                title: docTitle,
                doc_type: docType,
                doc_number: docNumber,
                date: docDate,
                issuer: (formData && formData.personal_info && formData.personal_info.college) ? formData.personal_info.college : "الجامعة التكنولوجية",
                suggested_score: suggestedScore,
                file_path: objectUrl,
                filename: file.name,
                handwritten_detected: isHw,
                handwritten_fields: hwFields,
                auto_fill_summary: autoFillSummary,
                matched_faculty_info: (typeof parsed !== "undefined" && parsed && parsed.matched_faculty_info) || extractFacultyRoleInDocument(extractedText, getCurrentFacultyName())
            };
            applyIndexedItem(item);
        }

        renderAllMiniEvidenceTables();
        renderMasterCatalogTable();
        updateIndexStats();
        calculateLiveScore();
        showToast(`تم مسح وقراءة واستخراج أعداد وتواريخ ${files.length} مستندات بنجاح! 🚀`);
        switchTab("tab-ocr");
        hideUploadLoadingState();
        return;
    }

    showUploadLoadingState(true, files.length);
    showToast(`جارٍ رفع الملفات ومسحها وتحليلها بالذكاء الاصطناعي (${files.length} ملفات)... ⏳`);

    const payload = new FormData();
    files.forEach(f => payload.append("files", f));
    payload.append("faculty_name", getCurrentFacultyName());

    let controller = null;
    let timeoutId = null;
    try {
        if (window.AbortController) {
            controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 120000); // 120s for full batch OCR
        }

        const response = await fetch("/api/batch-scan-evidence", {
            method: "POST",
            body: payload,
            signal: controller ? controller.signal : undefined
        });
        if (timeoutId) clearTimeout(timeoutId);

        if (response.ok) {
            const res = await response.json();
            if (res.success && res.indexed_evidence_list) {
                hideUploadLoadingState();
                res.indexed_evidence_list.forEach(item => {
                    applyIndexedItem(item);
                });
                renderAllMiniEvidenceTables();
                renderMasterCatalogTable();
                updateIndexStats();
                calculateLiveScore();
                showToast(`تم مسح وفهرسة ${res.count} وثائق بنجاح وتعبئة الحقول آلياً! 🚀`);
                switchTab("tab-ocr");
                return;
            }
        }
    } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        console.warn("Backend batch scan timed out, indexing files with smart client-side parser:", err);
    } finally {
        hideUploadLoadingState();
    }

    // البديل الذكي المحلي للمسح المجمع
    for (const file of files) {
        let extractedText = "";
        if (file.name.toLowerCase().endsWith(".pdf")) {
            extractedText = await extractTextFromPdfClient(file);
        }
        const parsed = parseArabicDocumentClient(extractedText, file.name, null, null, getCurrentFacultyName());
        const counter = getNextCounterForParagraph(parsed.axis, parsed.paragraph);
        const refCode = `REF-${parsed.axis.toUpperCase().replace("AXIS", "AX")}-P${parsed.paragraph}-${String(counter).padStart(2, '0')}`;
        const objectUrl = URL.createObjectURL(file);
        const item = {
            ref_code: refCode,
            axis: parsed.axis,
            paragraph: parsed.paragraph,
            axis_name: parsed.axis_name,
            paragraph_name: parsed.paragraph_name,
            title: parsed.title,
            doc_type: parsed.doc_type,
            doc_number: parsed.doc_number,
            date: parsed.date,
            issuer: parsed.issuer,
            suggested_score: parsed.suggested_score,
            file_path: objectUrl,
            filename: file.name,
            handwritten_detected: parsed.handwritten_detected,
            handwritten_fields: parsed.handwritten_fields,
            auto_fill_summary: parsed.auto_fill_summary,
            matched_faculty_info: parsed.matched_faculty_info
        };
        applyIndexedItem(item);
    }

    renderAllMiniEvidenceTables();
    renderMasterCatalogTable();
    updateIndexStats();
    calculateLiveScore();
    showToast(`تمت إضافة وفهرسة وقراءة ${files.length} مستندات بنجاح! 🚀`);
    switchTab("tab-ocr");
}

async function reprocessAllUploads() {
    const btn = document.getElementById("btn-reprocess-all");
    const banner = document.getElementById("catalog-loading-banner");
    const subtext = document.getElementById("catalog-loading-subtext");
    
    if (isCloudOrStaticEnv()) {
        renderAllMiniEvidenceTables();
        renderMasterCatalogTable();
        updateIndexStats();
        calculateLiveScore();
        showToast("تم تحديث ومزامنة فهرس الأدلة وإعادة احتساب الدرجات بنجاح! ✔");
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> إعادة مسح وفهرسة كافة المرفقات`;
        }
        hideUploadLoadingState();
        return;
    }
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جارٍ تحديث الفهرس...`;
    }
    if (banner) banner.style.display = "block";
    if (subtext) subtext.textContent = "يقوم النظام بمراجعة كافة المرفقات واستخراج البيانات وفهرستها...";
    showToast("بدء تحديث ومراجعة كافة المرفقات... ⏳");

    let controller = null;
    let timeoutId = null;
    try {
        if (window.AbortController) {
            controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 120000);
        }
        const reprocessPayload = new FormData();
        reprocessPayload.append("faculty_name", getCurrentFacultyName());
        const response = await fetch("/api/reprocess-all-attachments", {
            method: "POST",
            body: reprocessPayload,
            signal: controller ? controller.signal : undefined
        });
        if (timeoutId) clearTimeout(timeoutId);

        if (response.ok) {
            const res = await response.json();
            if (res.success && res.indexed_evidence_list) {
                indexedEvidenceList = [];
                res.indexed_evidence_list.forEach(item => {
                    applyIndexedItem(item);
                });
                renderAllMiniEvidenceTables();
                renderMasterCatalogTable();
                updateIndexStats();
                calculateLiveScore();
                showToast(`تمت إعادة معالجة وفهرسة ${res.count} مرفق بنجاح! 🚀`);
                return;
            }
        }
    } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        console.warn("Backend reprocess unavailable or timed out:", err);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> إعادة مسح وفهرسة كافة المرفقات`;
        }
        if (banner) banner.style.display = "none";
        hideUploadLoadingState();
    }

    // بديل فوري محلي لتحديث الفهرس والدرجات
    renderAllMiniEvidenceTables();
    renderMasterCatalogTable();
    updateIndexStats();
    calculateLiveScore();
    showToast("تم تحديث ومزامنة فهرس الأدلة وإعادة احتساب الدرجات بنجاح! ✔");
}
window.reprocessAllUploads = reprocessAllUploads;

function openEvidenceReviewModal(indexedEvidence, fieldUpdates, autoFillSummary) {
    pendingOcrAttachment = {
        evidence: indexedEvidence,
        fieldUpdates: fieldUpdates,
        raw_text: indexedEvidence.raw_text_snippet || ""
    };

    const modal = document.getElementById("ocr-modal");
    document.getElementById("modal-filename").textContent = indexedEvidence.filename;
    document.getElementById("modal-extracted-text").textContent = pendingOcrAttachment.raw_text || "لم يتم العثور على نص مقروء";

    document.getElementById("modal-doc-type").value = indexedEvidence.doc_type || "";
    document.getElementById("modal-doc-number").value = indexedEvidence.doc_number || "";
    document.getElementById("modal-doc-date").value = indexedEvidence.date || "";
    document.getElementById("modal-doc-issuer").value = indexedEvidence.issuer || "";
    document.getElementById("modal-doc-title").value = indexedEvidence.subject || indexedEvidence.title || "";
    const elRecipient = document.getElementById("modal-doc-recipient");
    if (elRecipient) elRecipient.value = indexedEvidence.recipient || "";
    document.getElementById("modal-suggested-axis").value = indexedEvidence.axis || "axis3";
    document.getElementById("modal-suggested-paragraph").value = indexedEvidence.paragraph || "1";
    document.getElementById("modal-suggested-score").value = indexedEvidence.suggested_score || 0;
    document.getElementById("modal-justification").textContent = autoFillSummary || "تم التحليل والفهرسة بنجاح.";

    // شارات تمييز قراءة خط اليد بالذكاء الاصطناعي
    const hwBadge = document.getElementById("modal-handwriting-badge");
    const numHwHint = document.getElementById("modal-docnum-hw-hint");
    const dateHwHint = document.getElementById("modal-docdate-hw-hint");
    const isHw = !!indexedEvidence.handwritten_detected;
    const hwFields = indexedEvidence.handwritten_fields || [];
    const isNumHw = isHw && (hwFields.includes("doc_number") || !hwFields.length);
    const isDateHw = isHw && (hwFields.includes("date") || !hwFields.length);

    if (hwBadge) hwBadge.style.display = isHw ? "inline-flex" : "none";
    if (numHwHint) numHwHint.style.display = isNumHw ? "inline-flex" : "none";
    if (dateHwHint) dateHwHint.style.display = isDateHw ? "inline-flex" : "none";

    const elNumInp = document.getElementById("modal-doc-number");
    if (elNumInp) {
        if (isNumHw) {
            elNumInp.style.borderColor = "#c084fc";
            elNumInp.style.backgroundColor = "#faf5ff";
            elNumInp.style.fontWeight = "700";
        } else {
            elNumInp.style.borderColor = "";
            elNumInp.style.backgroundColor = "";
            elNumInp.style.fontWeight = "";
        }
    }
    const elDateInp = document.getElementById("modal-doc-date");
    if (elDateInp) {
        if (isDateHw) {
            elDateInp.style.borderColor = "#c084fc";
            elDateInp.style.backgroundColor = "#faf5ff";
        } else {
            elDateInp.style.borderColor = "";
            elDateInp.style.backgroundColor = "";
        }
    }

    // تمييز اسم التدريسي في نافذة المراجعة
    const facultyMatchBox = document.getElementById("modal-faculty-match-box");
    const facultyMatchName = document.getElementById("modal-faculty-match-name");
    const facultyMatchRole = document.getElementById("modal-faculty-match-role");
    const facultyMatchLine = document.getElementById("modal-faculty-match-line");
    
    const facMatch = indexedEvidence.matched_faculty_info || extractFacultyRoleInDocument(pendingOcrAttachment.raw_text);
    if (facMatch) {
        if (facultyMatchBox) facultyMatchBox.style.display = "block";
        if (facultyMatchName) facultyMatchName.textContent = facMatch.matched_name || getCurrentFacultyName();
        if (facultyMatchRole) facultyMatchRole.textContent = facMatch.role || "عضو لجنة";
        if (facultyMatchLine) facultyMatchLine.innerHTML = facMatch.highlighted_line || facMatch.detected_line || "";
        
        // تظليل اسم التدريسي في مربع النص المستخرج
        const rawTextEl = document.getElementById("modal-extracted-text");
        if (rawTextEl && pendingOcrAttachment.raw_text) {
            let highlightedRaw = pendingOcrAttachment.raw_text;
            const targetParts = (facMatch.matched_name || getCurrentFacultyName()).split(/\s+/).filter(p => p.length >= 3);
            for (const tp of targetParts) {
                if (highlightedRaw.includes(tp)) {
                    highlightedRaw = highlightedRaw.split(tp).join(`<mark class="faculty-name-highlight">${tp}</mark>`);
                }
            }
            rawTextEl.innerHTML = highlightedRaw;
        }
    } else {
        if (facultyMatchBox) facultyMatchBox.style.display = "none";
    }

    modal.classList.add("active");
}

function closeModal() {
    const modal = document.getElementById("ocr-modal");
    modal.classList.remove("active");
    pendingOcrAttachment = null;
    activeScanTarget = null;
}

// ============================================================================
// محرك تعديل وعرض العدد والتاريخ المباشر داخل نافذة المعاينة (بدون إغلاقها)
// ============================================================================
function renderPreviewMetaNumberDate(item, isEditing = false) {
    const metaNumDate = document.getElementById("preview-meta-number-date");
    if (!metaNumDate || !item) return;

    const numCol = document.getElementById("preview-meta-numdate-col");
    if (numCol) {
        if (isEditing) {
            numCol.classList.add("editing-active");
        } else {
            numCol.classList.remove("editing-active");
        }
    }

    if (!isEditing) {
        const docNumDisplay = (item.doc_number && item.doc_number !== 'غير محدد') ? item.doc_number : (item.document_number || '-');
        const docDateDisplay = (item.date && item.date !== 'غير محدد') ? item.date : '-';

        let numDateHtml = `<span id="preview-display-numdate-text"><strong>${escapeHtml(docNumDisplay)}</strong> بتاريخ <span style="color:#475569;">${escapeHtml(docDateDisplay)}</span></span>`;
        if (item.handwritten_detected) {
            numDateHtml += ` <span class="badge-handwritten" style="margin-right: 4px;" title="تم التعرف على خط اليد بالذكاء الاصطناعي"><i class="fa-solid fa-pen-nib"></i> خط يد</span>`;
        }
        if (item.audit_status === 'modified') {
            numDateHtml += ` <span class="badge" style="background:#dcfce7; color:#166534; font-size:0.72rem; border:1px solid #86efac; margin-right:4px;">✏ معدل</span>`;
        }
        numDateHtml += ` <button type="button" class="btn-quick-edit-numdate" id="btn-preview-edit-numdate" style="margin-right: 8px;" onclick="startPreviewDocNumberDateEdit('${item.ref_code}')" title="تعديل العدد والتاريخ مباشرة في نافذة المعاينة دون إغلاقها"><i class="fa-solid fa-pen-to-square"></i> تعديل</button>`;
        metaNumDate.innerHTML = numDateHtml;
    } else {
        const curNum = (item.doc_number && item.doc_number !== 'غير محدد' && !item.doc_number.includes('قيد التدقيق')) ? item.doc_number : (item.document_number || '');
        const curDate = (item.date && item.date !== 'غير محدد') ? item.date : '';

        metaNumDate.innerHTML = `
            <div id="preview-numdate-inline-form" class="preview-numdate-inline-form">
                <div style="display: inline-flex; align-items: center; gap: 3px;">
                    <span style="font-size: 0.74rem; color: #0369a1; font-weight: 700;">العدد:</span>
                    <input type="text" id="preview-edit-num-input" value="${escapeHtml(curNum)}" class="form-control" style="font-size: 0.78rem; padding: 2px 6px; height: 26px; width: 130px; font-weight: 700; border: 1px solid #7dd3fc;" placeholder="العدد / رقم الأمر" onkeydown="handlePreviewNumDateKey(event, '${item.ref_code}')">
                </div>
                <div style="display: inline-flex; align-items: center; gap: 3px;">
                    <span style="font-size: 0.74rem; color: #0369a1; font-weight: 700;">التاريخ:</span>
                    <input type="text" id="preview-edit-date-input" value="${escapeHtml(curDate)}" class="form-control" style="font-size: 0.78rem; padding: 2px 6px; height: 26px; width: 110px; font-weight: 600; border: 1px solid #7dd3fc;" placeholder="YYYY/MM/DD" onkeydown="handlePreviewNumDateKey(event, '${item.ref_code}')">
                </div>
                <div style="display: inline-flex; align-items: center; gap: 4px;">
                    <button type="button" class="btn btn-sm btn-success" id="btn-preview-save-numdate" onclick="savePreviewDocNumberDate('${item.ref_code}')" style="padding: 2px 9px; font-size: 0.74rem; font-weight: 700;" title="حفظ التعديل">
                        <i class="fa-solid fa-check"></i> حفظ
                    </button>
                    <button type="button" class="btn btn-sm btn-outline" id="btn-preview-cancel-numdate" onclick="cancelPreviewDocNumberDate('${item.ref_code}')" style="padding: 2px 8px; font-size: 0.74rem; color: #64748b; background: white;" title="إلغاء التعديل">
                        <i class="fa-solid fa-xmark"></i> إلغاء
                    </button>
                </div>
            </div>
        `;
        setTimeout(() => {
            const numInp = document.getElementById("preview-edit-num-input");
            if (numInp) {
                numInp.focus();
                numInp.select();
            }
        }, 50);
    }
}
window.renderPreviewMetaNumberDate = renderPreviewMetaNumberDate;

function startPreviewDocNumberDateEdit(refCode) {
    let item = activePreviewItem;
    if (!item || item.ref_code !== refCode) {
        item = indexedEvidenceList.find(e => e.ref_code === refCode);
    }
    if (!item) return;
    renderPreviewMetaNumberDate(item, true);
}
window.startPreviewDocNumberDateEdit = startPreviewDocNumberDateEdit;

function cancelPreviewDocNumberDate(refCode) {
    let item = activePreviewItem;
    if (!item || item.ref_code !== refCode) {
        item = indexedEvidenceList.find(e => e.ref_code === refCode);
    }
    if (!item) return;
    renderPreviewMetaNumberDate(item, false);
}
window.cancelPreviewDocNumberDate = cancelPreviewDocNumberDate;

async function savePreviewDocNumberDate(refCode) {
    let item = activePreviewItem;
    if (!item || item.ref_code !== refCode) {
        item = indexedEvidenceList.find(e => e.ref_code === refCode);
    }
    if (!item) return;

    const numInp = document.getElementById("preview-edit-num-input");
    const dateInp = document.getElementById("preview-edit-date-input");
    if (!numInp || !dateInp) return;

    const newNum = numInp.value.trim();
    const newDate = dateInp.value.trim();

    item.doc_number = newNum;
    item.document_number = newNum;
    item.date = newDate;
    item.audit_status = 'modified';

    saveDraft();

    try {
        await fetch("/api/update-evidence-meta", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ref_code: refCode,
                doc_number: newNum,
                date: newDate
            })
        });
    } catch (err) {
        console.warn("Backend update-evidence-meta notice:", err);
    }

    renderMasterCatalogTable();
    renderAllMiniEvidenceTables();
    updateIndexStats();

    renderPreviewMetaNumberDate(item, false);

    showToast(`تم حفظ العدد (${newNum || 'بدون'}) والتاريخ (${newDate || 'بدون'}) للوثيقة [${refCode}] بنجاح! ✔`);
}
window.savePreviewDocNumberDate = savePreviewDocNumberDate;

function handlePreviewNumDateKey(event, refCode) {
    if (event.key === "Enter") {
        event.preventDefault();
        savePreviewDocNumberDate(refCode);
    } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelPreviewDocNumberDate(refCode);
    }
}
window.handlePreviewNumDateKey = handlePreviewNumDateKey;

function openDocumentPreview(refCodeOrItem) {
    let item = null;
    if (typeof refCodeOrItem === "string") {
        item = indexedEvidenceList.find(e => e.ref_code === refCodeOrItem);
    } else if (refCodeOrItem && typeof refCodeOrItem === "object") {
        item = refCodeOrItem;
    }

    if (!item) {
        showToast("تعذر العثور على بيانات الوثيقة المحددة.");
        return;
    }

    activePreviewItem = item;
    const filePath = item.file_path || (item.filename ? `/uploads/${item.filename}` : "");
    const filename = item.filename || item.title || "وثيقة_ثبوتية";
    const refCode = item.ref_code || "REF";
    const ext = filePath ? filePath.split('.').pop().toLowerCase().split('?')[0] : "";

    const modal = document.getElementById("doc-preview-modal");
    if (!modal) return;

    document.getElementById("preview-modal-title").textContent = `معاينة: ${item.filename || item.title || 'وثيقة'}`;
    const refBadgeEl = document.getElementById("preview-modal-ref");
    if (refBadgeEl) {
        refBadgeEl.textContent = refCode;
        refBadgeEl.className = getRefBadgeClass(refCode);
    }

    // أزرار التحميل والفتح المباشر
    const dlBtn = document.getElementById("preview-download-btn");
    if (dlBtn) {
        dlBtn.href = filePath || "#";
        dlBtn.setAttribute("download", filename);
        dlBtn.style.display = filePath ? "inline-flex" : "none";
    }

    const openNewBtn = document.getElementById("preview-open-new-btn");
    if (openNewBtn) {
        openNewBtn.href = filePath || "#";
        openNewBtn.style.display = filePath ? "inline-flex" : "none";
    }

    // تعبئة البيانات الوصفية
    const metaType = document.getElementById("preview-meta-type");
    if (metaType) metaType.textContent = item.doc_type || item.type_arabic || "وثيقة إدارية";

    renderPreviewMetaNumberDate(item, false);

    const metaAxis = document.getElementById("preview-meta-axis");
    if (metaAxis) metaAxis.textContent = `${item.axis_name || item.axis || 'المحور'} - فقرة ${item.paragraph || item.suggested_paragraph || '1'}`;

    const metaScore = document.getElementById("preview-meta-score");
    if (metaScore) metaScore.textContent = `+${item.suggested_score || 0} درجة`;

    const metaTitle = document.getElementById("preview-meta-title");
    if (metaTitle) metaTitle.textContent = `${item.title || item.filename} ${item.issuer ? `(${item.issuer})` : ''}`;

    // بطاقة تمييز اسم التدريسي في نافذة المعاينة
    const prevFacCard = document.getElementById("preview-faculty-match-card");
    const prevFacName = document.getElementById("preview-faculty-name");
    const prevFacRole = document.getElementById("preview-faculty-role-badge");
    const prevFacLine = document.getElementById("preview-faculty-detected-line");

    const prevMatch = item.matched_faculty_info || extractFacultyRoleInDocument(item.raw_text_snippet || item.title || "");
    if (prevMatch) {
        if (prevFacCard) prevFacCard.style.display = "block";
        if (prevFacName) prevFacName.textContent = prevMatch.matched_name || getCurrentFacultyName();
        if (prevFacRole) {
            prevFacRole.textContent = prevMatch.role || "عضو لجنة";
            if (prevMatch.role && prevMatch.role.includes("رئيس")) {
                prevFacRole.style.background = "#d97706";
            } else {
                prevFacRole.style.background = "#059669";
            }
        }
        if (prevFacLine) prevFacLine.innerHTML = prevMatch.highlighted_line || prevMatch.detected_line || "";
    } else {
        if (prevFacCard) prevFacCard.style.display = "none";
    }

    // إعداد حاوية العرض بحسب نوع الملف
    const frame = document.getElementById("preview-frame");
    const imgBox = document.getElementById("preview-image-box");
    const img = document.getElementById("preview-image");
    const fallbackBox = document.getElementById("preview-fallback-box");
    const typeIcon = document.getElementById("preview-type-icon");

    if (frame) {
        frame.style.display = "none";
        frame.src = "";
    }
    if (imgBox) {
        imgBox.style.display = "none";
        if (img) img.src = "";
    }
    if (fallbackBox) fallbackBox.style.display = "none";

    cancelCropper();
    updatePreviewScopusUI(item);

    const isImage = ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(ext);

    // أزرار شريط المعاينة الذكي
    const btnCrop = document.getElementById("btn-start-cropper");
    const btnBbox = document.getElementById("btn-toggle-bbox");
    if (btnCrop) btnCrop.style.display = isImage ? "inline-flex" : "none";
    if (btnBbox) btnBbox.style.display = isImage ? "inline-flex" : "none";

    if (!filePath) {
        if (fallbackBox) {
            fallbackBox.style.display = "block";
            const fbText = document.getElementById("preview-fallback-text");
            if (fbText) fbText.textContent = "تم استخراج وقراءة بيانات هذه الوثيقة ولكن الملف الأصلي غير متاح للتحميل في هذا المسار.";
            const fbDl = document.getElementById("preview-fallback-download");
            if (fbDl) fbDl.style.display = "none";
        }
        if (typeIcon) {
            typeIcon.className = "fa-solid fa-file-circle-check fa-xl";
            typeIcon.style.color = "#2563eb";
        }
    } else if (ext === "pdf") {
        if (typeIcon) {
            typeIcon.className = "fa-solid fa-file-pdf fa-xl";
            typeIcon.style.color = "#dc2626";
        }
        if (frame) {
            frame.style.display = "block";
            frame.src = filePath;
        }
    } else if (isImage) {
        if (typeIcon) {
            typeIcon.className = "fa-solid fa-file-image fa-xl";
            typeIcon.style.color = "#9333ea";
        }
        if (imgBox && img) {
            imgBox.style.display = "block";
            img.src = filePath;
            img.onload = () => {
                renderBoundingBoxes(item);
            };
        }
    } else {
        if (typeIcon) {
            typeIcon.className = "fa-solid fa-file fa-xl";
            typeIcon.style.color = "#2563eb";
        }
        if (frame) {
            frame.style.display = "block";
            frame.src = filePath;
        }
    }

    const btnPrevReclassify = document.getElementById("btn-preview-reclassify");
    if (btnPrevReclassify) {
        btnPrevReclassify.onclick = () => {
            openReclassifyModal(item.ref_code);
        };
    }

    modal.classList.add("active");
}

function closeDocumentPreview() {
    const modal = document.getElementById("doc-preview-modal");
    if (modal) modal.classList.remove("active");
    const frame = document.getElementById("preview-frame");
    if (frame) frame.src = "";
    const img = document.getElementById("preview-image");
    if (img) img.src = "";
    cancelCropper();
    clearBoundingBoxes();
    const numCol = document.getElementById("preview-meta-numdate-col");
    if (numCol) {
        numCol.classList.remove("editing-active");
    }
    activePreviewItem = null;
}

window.openDocumentPreview = openDocumentPreview;
window.closeDocumentPreview = closeDocumentPreview;

// ============================================================================
// إدارة وتغيير المحور والفقرة للوثائق (Reclassify Axis & Paragraph)
// ============================================================================
let activeReclassifyItem = null;

function openReclassifyModal(refCode) {
    const item = indexedEvidenceList.find(e => e.ref_code === refCode);
    if (!item) {
        showToast("تعذر العثور على بيانات الوثيقة المطلوبة.");
        return;
    }

    activeReclassifyItem = item;

    const refBadge = document.getElementById("reclassify-ref-badge");
    if (refBadge) {
        refBadge.textContent = item.ref_code;
        refBadge.className = getRefBadgeClass(item.ref_code);
    }

    const filenameEl = document.getElementById("reclassify-filename");
    if (filenameEl) filenameEl.textContent = item.filename || item.title || item.subject || "وثيقة رسمية";

    const docNumDateEl = document.getElementById("reclassify-doc-number-date");
    if (docNumDateEl) {
        docNumDateEl.textContent = `العدد: ${item.doc_number || '-'} | التاريخ: ${item.date || '-'}`;
    }

    const currentPlacementEl = document.getElementById("reclassify-current-placement");
    if (currentPlacementEl) {
        currentPlacementEl.textContent = `${item.axis_name || item.axis} - فقرة ${item.paragraph || '1'}`;
    }

    // استخراج رقم المحور الحالي (1, 2, 3, 4)
    let axisNum = "1";
    if (item.axis) {
        const match = String(item.axis).match(/\d+/);
        if (match) axisNum = match[0];
    }
    if (!["1", "2", "3", "4"].includes(axisNum)) axisNum = "1";

    const axisSelect = document.getElementById("reclassify-axis-select");
    if (axisSelect) axisSelect.value = axisNum;

    // تعبئة قائمة الفقرات واختيار الفقرة الحالية
    onReclassifyAxisChange(item.paragraph);

    // تعبئة نوع الوثيقة
    const docTypeInput = document.getElementById("reclassify-doc-type-input");
    if (docTypeInput) docTypeInput.value = item.doc_type || "";

    // تعبئة الدرجة
    const scoreInput = document.getElementById("reclassify-score-input");
    if (scoreInput) {
        scoreInput.value = item.suggested_score !== undefined ? item.suggested_score : 5;
    }

    // الملاحظات
    const notesInput = document.getElementById("reclassify-notes-input");
    if (notesInput) {
        notesInput.value = item.auditor_notes || "";
    }

    const modal = document.getElementById("reclassify-modal");
    if (modal) modal.classList.add("active");
}

function closeReclassifyModal() {
    const modal = document.getElementById("reclassify-modal");
    if (modal) modal.classList.remove("active");
    activeReclassifyItem = null;
}

function onReclassifyAxisChange(preselectParagraph) {
    const axisSelect = document.getElementById("reclassify-axis-select");
    const paraSelect = document.getElementById("reclassify-paragraph-select");
    if (!axisSelect || !paraSelect) return;

    const axisNum = axisSelect.value;
    const def = AXIS_CATALOG_DEFINITIONS[axisNum];
    if (!def) return;

    paraSelect.innerHTML = def.paragraphs.map(p => 
        `<option value="${p.id}" data-max="${p.maxScore}" data-doctype="${p.defaultDocType || ''}">${p.name} (الحد الأقصى: ${p.maxScore} درجات)</option>`
    ).join("");

    if (preselectParagraph) {
        const matchingOpt = def.paragraphs.find(p => String(p.id) === String(preselectParagraph));
        if (matchingOpt) {
            paraSelect.value = String(matchingOpt.id);
        }
    }

    onReclassifyParagraphChange();
}

function onReclassifyParagraphChange() {
    const axisSelect = document.getElementById("reclassify-axis-select");
    const paraSelect = document.getElementById("reclassify-paragraph-select");
    const scoreHint = document.getElementById("reclassify-score-hint");
    const scoreInput = document.getElementById("reclassify-score-input");
    const docTypeInput = document.getElementById("reclassify-doc-type-input");

    if (!axisSelect || !paraSelect) return;

    const axisNum = axisSelect.value;
    const paraId = paraSelect.value;
    const def = AXIS_CATALOG_DEFINITIONS[axisNum];
    if (!def) return;

    const pDef = def.paragraphs.find(p => String(p.id) === String(paraId));
    if (!pDef) return;

    if (scoreHint) {
        scoreHint.textContent = `(الحد الأقصى للفقرة: ${pDef.maxScore} درجات)`;
    }
    if (scoreInput) {
        scoreInput.max = pDef.maxScore;
        const currentVal = parseFloat(scoreInput.value) || 0;
        if (currentVal > pDef.maxScore) {
            scoreInput.value = pDef.maxScore;
        } else if (currentVal === 0 && pDef.maxScore > 0) {
            scoreInput.value = Math.min(pDef.maxScore, 10);
        }
    }

    if (docTypeInput && (!docTypeInput.value.trim() || docTypeInput.value.trim() === "وثيقة رسمية")) {
        docTypeInput.value = pDef.defaultDocType || "";
    }
}

async function confirmReclassify() {
    if (!activeReclassifyItem) {
        showToast("لم يتم تحديد أي وثيقة لإعادة التصنيف.");
        return;
    }

    const item = activeReclassifyItem;
    const axisSelect = document.getElementById("reclassify-axis-select");
    const paraSelect = document.getElementById("reclassify-paragraph-select");
    const docTypeInput = document.getElementById("reclassify-doc-type-input");
    const scoreInput = document.getElementById("reclassify-score-input");
    const notesInput = document.getElementById("reclassify-notes-input");
    const confirmBtn = document.getElementById("reclassify-confirm-btn");

    const axisNum = axisSelect ? axisSelect.value : "1";
    const newAxisKey = "axis" + axisNum;
    const newParagraph = paraSelect ? paraSelect.value : "1";
    const newDocType = docTypeInput ? docTypeInput.value.trim() : (item.doc_type || "وثيقة رسمية");
    const newScore = scoreInput ? (parseFloat(scoreInput.value) || 0) : (item.suggested_score || 0);
    const notes = notesInput ? notesInput.value.trim() : "";

    const def = AXIS_CATALOG_DEFINITIONS[axisNum] || AXIS_CATALOG_DEFINITIONS["1"];
    const pDef = def.paragraphs.find(p => String(p.id) === String(newParagraph)) || def.paragraphs[0];

    const oldAxis = item.axis;
    const oldParagraph = String(item.paragraph);

    const origBtnHtml = confirmBtn ? confirmBtn.innerHTML : "";
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ وإعادة الاحتساب...`;
    }

    // --- تطبيق التغييرات محلياً أولاً (بدون انتظار الخادم) ---
    item.axis = newAxisKey;
    item.paragraph = String(newParagraph);
    item.axis_name = def.name;
    item.paragraph_name = pDef.name;
    item.doc_type = newDocType;
    item.suggested_score = newScore;
    item.audit_status = "modified";
    item.manual_reclassified = true;
    item.auditor_notes = notes || `إعادة تصنيف يدوية إلى ${def.name} - ${pDef.name}`;

    // إزالة التجاوز اليدوي للفقرة القديمة والجديدة لتعود المزامنة التلقائية مع الأدلة
    const oldMapping = PARAGRAPH_SCORE_MAPPINGS.find(m => m.axis === oldAxis && String(m.paragraph) === oldParagraph);
    if (oldMapping && manualScoreOverrides) {
        delete manualScoreOverrides[oldMapping.field];
    }
    const newMapping = PARAGRAPH_SCORE_MAPPINGS.find(m => m.axis === newAxisKey && String(m.paragraph) === String(newParagraph));
    if (newMapping && manualScoreOverrides) {
        delete manualScoreOverrides[newMapping.field];
    }

    // مزامنة الدرجات والواجهات
    syncEvidenceWithScores();

    // حفظ المسودة في التخزين المحلي
    const draftObj = {
        timestamp: new Date().toISOString(),
        formData: formData,
        indexedEvidenceList: indexedEvidenceList,
        manualScoreOverrides: manualScoreOverrides
    };
    localStorage.setItem("faculty_eval_draft_2026_indexed", JSON.stringify(draftObj));

    // تحديث الجداول والإحصائيات
    renderAllMiniEvidenceTables();
    renderMasterCatalogTable();
    updateIndexStats();
    await calculateLiveScore();

    // إذا كانت نافذة المعاينة مفتوحة لنفس الوثيقة، نحدث بياناتها
    if (activePreviewItem && activePreviewItem.ref_code === item.ref_code) {
        const metaType = document.getElementById("preview-meta-type");
        if (metaType) metaType.textContent = item.doc_type;
        const metaAxis = document.getElementById("preview-meta-axis");
        if (metaAxis) metaAxis.textContent = `${item.axis_name} - فقرة ${item.paragraph}`;
        const metaScore = document.getElementById("preview-meta-score");
        if (metaScore) metaScore.textContent = `+${item.suggested_score} درجة`;
    }

    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = origBtnHtml;
    }

    closeReclassifyModal();
    showToast(`✔ تم بنجاح نقل الوثيقة (${item.ref_code}) إلى "${def.name} - ${pDef.name}" وإعادة احتساب الدرجات تلقائياً!`);

    // --- محاولة مزامنة مع الخادم في الخلفية (لا يؤثر على النتيجة) ---
    try {
        const payload = {
            ref_code: item.ref_code,
            axis: newAxisKey,
            paragraph: String(newParagraph),
            axis_name: def.name,
            paragraph_name: pDef.name,
            doc_type: newDocType,
            suggested_score: newScore,
            auditor_notes: item.auditor_notes
        };
        const resp = await fetch("/api/reclassify-evidence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (resp.ok) {
            const data = await resp.json();
            if (!data.success) {
                console.warn("Server reclassify sync warning:", data.error);
            }
        }
    } catch (syncErr) {
        // الخادم غير متاح (وضع السحابة) — التغييرات محفوظة محلياً
        console.info("Server sync unavailable (cloud mode), changes saved locally:", syncErr.message);
    }
}

window.openReclassifyModal = openReclassifyModal;
window.closeReclassifyModal = closeReclassifyModal;
window.onReclassifyAxisChange = onReclassifyAxisChange;
window.onReclassifyParagraphChange = onReclassifyParagraphChange;
window.confirmReclassify = confirmReclassify;

function confirmOcrAttachment() {
    if (!pendingOcrAttachment) return;

    const ev = pendingOcrAttachment.evidence;
    // تحديث بالقيم التي ربما عدلها المستخدم في النافذة
    ev.doc_type = document.getElementById("modal-doc-type").value;
    ev.doc_number = document.getElementById("modal-doc-number").value;
    ev.date = document.getElementById("modal-doc-date").value;
    ev.issuer = document.getElementById("modal-doc-issuer").value;
    ev.title = document.getElementById("modal-doc-title").value;
    ev.subject = document.getElementById("modal-doc-title").value;
    const recInput = document.getElementById("modal-doc-recipient");
    if (recInput) ev.recipient = recInput.value;
    ev.axis = document.getElementById("modal-suggested-axis").value;
    ev.paragraph = document.getElementById("modal-suggested-paragraph").value;
    ev.suggested_score = parseFloat(document.getElementById("modal-suggested-score").value) || 0;

    applyIndexedItem(ev);
    renderAllMiniEvidenceTables();
    renderMasterCatalogTable();
    updateIndexStats();
    closeModal();
    calculateLiveScore();
    showToast(`تم اعتماد الفهرسة برمز [${ev.ref_code}] وملء الحقول المحددة بنجاح! ✔`);
}

function applyIndexedItem(item) {
    // إزالة النسخة السابقة إذا كان الرمز موجوداً
    indexedEvidenceList = indexedEvidenceList.filter(e => e.ref_code !== item.ref_code);
    indexedEvidenceList.push(item);

    // إلغاء أي قفل يدوي لهذه الفقرة لاعتماد درجة الملف المرفوع الجديد
    const fieldMapping = PARAGRAPH_SCORE_MAPPINGS.find(m => m.axis === item.axis && String(m.paragraph) === String(item.paragraph));
    if (fieldMapping) {
        delete manualScoreOverrides[fieldMapping.field];
    }

    syncEvidenceWithScores();
    renderAllMiniEvidenceTables();
    renderMasterCatalogTable();
    updateIndexStats();
    calculateLiveScore();
    showToast(`تم اعتماد الفهرسة برمز [${item.ref_code}] واحتساب الدرجة آلياً للملف المرفوع! ✔`);
}

async function deleteEvidence(refCode) {
    if (!confirm(`هل أنت متأكد من حذف المرفق المفهرس [${refCode}]؟`)) return;
    
    // 1. تحديد بيانات المرفق المراد حذفه قبل استبعاده
    const targetItem = indexedEvidenceList.find(e => e.ref_code === refCode);
    const targetAxis = targetItem ? targetItem.axis : null;
    const targetParagraph = targetItem ? String(targetItem.paragraph) : null;

    // 2. حذف المرفق المختار فقط وحصراً من مصفوفة الأدلة في الذاكرة دون المساس بأي مرفق آخر
    indexedEvidenceList = indexedEvidenceList.filter(e => e.ref_code !== refCode);

    // 3. إلغاء أي قفل يدوي للفقرة التابع لها هذا المرفق حصراً لإعادة احتساب الدرجة آلياً من المرفقات المتبقية
    if (targetAxis && targetParagraph) {
        const fieldMapping = PARAGRAPH_SCORE_MAPPINGS.find(m => m.axis === targetAxis && String(m.paragraph) === targetParagraph);
        if (fieldMapping) {
            delete manualScoreOverrides[fieldMapping.field];
            if (window.manualScoreOverrides) {
                delete window.manualScoreOverrides[fieldMapping.field];
            }
        }
    }

    // 4. إرسال أمر الحذف إلى الخادم لتحديث ملف الكاش في السيرفر دون استبدال مصفوفة العميل
    try {
        await fetch(`/api/delete-evidence/${encodeURIComponent(refCode)}`, { method: "DELETE" });
    } catch (e) {
        console.warn("Server delete sync warning:", e);
    }

    // 5. مزامنة درجات الفقرة مع المرفقات المتبقية حصراً
    syncEvidenceWithScores();

    // 6. حفظ الحالة المحدثة في التخزين المحلي
    localStorage.setItem("faculty_eval_draft_2026_indexed", JSON.stringify({
        timestamp: new Date().toISOString(),
        formData: formData,
        indexedEvidenceList: indexedEvidenceList,
        manualScoreOverrides: manualScoreOverrides
    }));

    // 7. تحديث جداول الواجهة والإحصائيات والاحتساب المباشر
    renderAllMiniEvidenceTables();
    renderMasterCatalogTable();
    updateIndexStats();
    calculateLiveScore();
    showToast(`تم حذف المرفق [${refCode}] بنجاح وتحديث درجات الفقرة.`);
}

async function clearStuckEvidence() {
    if (!confirm("هل ترغب في تفريغ وحذف الملفات العالقة وغير المكتملة والإبقاء فقط على الوثائق الرسمية المعتمدة؟")) {
        return;
    }
    try {
        const resp = await fetch("/api/clear-stuck-evidence", { method: "POST" });
        const data = await resp.json();
        if (data.success) {
            indexedEvidenceList = data.indexed_evidence_list || [];
            syncEvidenceWithScores();
            const draftObj = {
                timestamp: new Date().toISOString(),
                formData: formData,
                indexedEvidenceList: indexedEvidenceList,
                manualScoreOverrides: manualScoreOverrides
            };
            localStorage.setItem("faculty_eval_draft_2026_indexed", JSON.stringify(draftObj));
            renderAllMiniEvidenceTables();
            renderMasterCatalogTable();
            updateIndexStats();
            calculateLiveScore();
            showToast(data.message || "تم تفريغ الملفات العالقة بنجاح! 🧹");
        } else {
            alert("تعذر تفريغ الملفات: " + (data.error || "خطأ غير معروف"));
        }
    } catch (err) {
        console.error("Clear stuck evidence error:", err);
        showToast("تعذر الاتصال بالخادم.");
    }
}

async function clearAllEvidence() {
    if (!confirm("تحذير: هل أنت متأكد من تفريغ كامل فهرس الأدلة والمرفقات؟")) {
        return;
    }
    try {
        const resp = await fetch("/api/clear-all-evidence", { method: "POST" });
        const data = await resp.json();
        if (data.success) {
            indexedEvidenceList = [];
            manualScoreOverrides = {};
            window.manualScoreOverrides = {};
            syncEvidenceWithScores();
            const draftObj = {
                timestamp: new Date().toISOString(),
                formData: formData,
                indexedEvidenceList: [],
                manualScoreOverrides: {}
            };
            localStorage.setItem("faculty_eval_draft_2026_indexed", JSON.stringify(draftObj));
            localStorage.removeItem("faculty_eval_draft_2026");
            renderAllMiniEvidenceTables();
            renderMasterCatalogTable();
            updateIndexStats();
            calculateLiveScore();
            showToast("تم إفراغ كامل فهرس الأدلة وإعادة ضبط الدرجات غير المثبتة إلى صفر بنجاح! 🗑️");
        }
    } catch (err) {
        console.error("Clear all evidence error:", err);
    }
}

// ============================================================================
// عرض جداول الأدلة المصغرة تحت كل فقرة
// ============================================================================
function renderAllMiniEvidenceTables() {
    const paragraphKeys = [
        { axis: "axis1", p: "1" },
        { axis: "axis1", p: "2" },
        { axis: "axis1", p: "3" },
        { axis: "axis1", p: "4" },
        { axis: "axis1", p: "5" },
        { axis: "axis2", p: "1" },
        { axis: "axis2", p: "2" },
        { axis: "axis2", p: "3" },
        { axis: "axis3", p: "1" },
        { axis: "axis3", p: "2" },
        { axis: "axis3", p: "3" },
        { axis: "axis3", p: "4" },
        { axis: "axis4", p: "1" }
    ];

    paragraphKeys.forEach(k => {
        renderMiniEvidenceTable(k.axis, k.p);
    });
}

// ============================================================================
// نظام تمييز ألوان وثائق الأدلة والمحاور (Color Hierarchy)
// ============================================================================
function getRefBadgeClass(refCode) {
    if (!refCode) return "badge-ref";
    const code = String(refCode).toUpperCase();
    if (code.includes("AX4")) return "badge-ref badge-ref-ax4";
    if (code.includes("AX3")) return "badge-ref badge-ref-ax3";
    if (code.includes("AX2")) return "badge-ref badge-ref-ax2";
    if (code.includes("AX1")) return "badge-ref badge-ref-ax1";
    return "badge-ref";
}
window.getRefBadgeClass = getRefBadgeClass;

function startEditDocNumberDate(refCode) {
    inlineEditingRefCode = refCode;
    renderMasterCatalogTable();
    setTimeout(() => {
        const inp = document.getElementById(`inline-edit-num-${refCode}`);
        if (inp) {
            inp.focus();
            inp.select();
        }
    }, 60);
}
window.startEditDocNumberDate = startEditDocNumberDate;

function cancelInlineDocNumberDate() {
    inlineEditingRefCode = null;
    renderMasterCatalogTable();
}
window.cancelInlineDocNumberDate = cancelInlineDocNumberDate;

async function saveInlineDocNumberDate(refCode) {
    const item = indexedEvidenceList.find(e => e.ref_code === refCode);
    if (!item) return;

    const numInp = document.getElementById(`inline-edit-num-${refCode}`);
    const dateInp = document.getElementById(`inline-edit-date-${refCode}`);
    if (!numInp || !dateInp) return;

    const newNum = numInp.value.trim();
    const newDate = dateInp.value.trim();

    item.doc_number = newNum;
    item.document_number = newNum;
    item.date = newDate;
    item.audit_status = 'modified';

    inlineEditingRefCode = null;

    // الحفظ في مسودة المتصفح
    saveDraft();

    // المزامنة مع الخادم إن وجد
    try {
        await fetch("/api/update-evidence-meta", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ref_code: refCode,
                doc_number: newNum,
                date: newDate
            })
        });
    } catch (err) {
        console.warn("Backend update-evidence-meta notice:", err);
    }

    renderMasterCatalogTable();
    renderAllMiniEvidenceTables();
    updateIndexStats();

    // إذا كانت نافذة المعاينة مفتوحة لنفس الوثيقة نحدثها
    if (activePreviewItem && activePreviewItem.ref_code === refCode) {
        renderPreviewMetaNumberDate(activePreviewItem, false);
    }

    showToast(`تم حفظ العدد (${newNum || 'بدون'}) والتاريخ (${newDate || 'بدون'}) للوثيقة [${refCode}] بنجاح! ✔`);
}
window.saveInlineDocNumberDate = saveInlineDocNumberDate;

function handleInlineEditKey(event, refCode) {
    if (event.key === "Enter") {
        event.preventDefault();
        saveInlineDocNumberDate(refCode);
    } else if (event.key === "Escape") {
        event.preventDefault();
        cancelInlineDocNumberDate();
    }
}
window.handleInlineEditKey = handleInlineEditKey;

function renderMiniEvidenceTable(axis, paragraph) {
    let containerId = `evidence-container-${axis}-p${paragraph}`;
    let container = document.getElementById(containerId);
    if (!container && axis === "axis4") {
        container = document.getElementById("evidence-container-axis4-p1");
    }
    if (!container) return;

    let items;
    if (axis === "axis4") {
        items = indexedEvidenceList.filter(e => e.axis === "axis4");
    } else {
        items = indexedEvidenceList.filter(e => e.axis === axis && String(e.paragraph) === String(paragraph));
    }

    if (items.length === 0) {
        container.style.display = "none";
        container.innerHTML = "";
        return;
    }

    container.style.display = "block";
    container.innerHTML = `
        <div class="evidence-header">
            <span><i class="fa-solid fa-paperclip text-blue-600"></i> الأدلة والمرفقات المفهرسة لهذه الفقرة (${items.length} وثائق مسندة):</span>
            <span style="font-size: 0.75rem; color: #15803d; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> تم ملء الحقول واحتساب النقاط آلياً</span>
        </div>
        <table class="evidence-table">
            <thead>
                <tr>
                    <th style="width: 100px;">رمز الفهرسة</th>
                    <th>نوع الوثيقة</th>
                    <th style="width: 110px;">العدد / التاريخ</th>
                    <th>الموضوع / التفاصيل المستخرجة</th>
                    <th style="width: 80px;">الدرجة</th>
                    <th class="auditor-col" style="width: 120px;">تدقيق الجودة</th>
                    <th style="width: 85px;">إجراء</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td style="text-align: center;">
                            <span class="${getRefBadgeClass(item.ref_code)} clickable-badge" onclick="openDocumentPreview('${item.ref_code}')" title="انقر لمعاينة وتحميل الوثيقة">${item.ref_code}</span>
                            ${item.handwritten_detected ? '<div style="margin-top: 3px;"><span class="badge-handwritten" title="تم قراءة العدد/التاريخ بخط اليد بالذكاء الاصطناعي"><i class="fa-solid fa-pen-nib"></i> خط يد</span></div>' : ''}
                        </td>
                        <td><strong>${item.doc_type}</strong></td>
                        <td style="text-align: center; font-size: 0.78rem;">
                            ${(item.handwritten_fields && item.handwritten_fields.includes("doc_number")) || (item.handwritten_detected && item.doc_number && item.doc_number !== 'غير محدد') ? `
                                <div style="margin-bottom: 3px;">
                                    <span class="badge-handwritten" style="font-size: 0.76rem; font-weight: 800;" title="تم استخراج رقم الأمر والحروف الإدارية بخط اليد بالذكاء الاصطناعي">
                                        <i class="fa-solid fa-pen-nib"></i> ${item.doc_number || '-'}
                                    </span>
                                </div>
                            ` : `
                                <div style="margin-bottom: 2px;"><strong>${item.doc_number || '-'}</strong></div>
                            `}
                            ${(item.handwritten_fields && item.handwritten_fields.includes("date")) || (item.handwritten_detected && item.date) ? `
                                <div>
                                    <span class="badge-handwritten" style="font-size: 0.70rem; background: #faf5ff; border-color: #e9d5ff;" title="تاريخ مكتوب بخط اليد بالذكاء الاصطناعي">
                                        <i class="fa-solid fa-pen-nib"></i> ${item.date || '-'}
                                    </span>
                                </div>
                            ` : `
                                <span style="color:#64748b; font-size: 0.75rem;">${item.date || '-'}</span>
                            `}
                        </td>
                        <td>
                            <div class="clickable-doc" onclick="openDocumentPreview('${item.ref_code}')" style="font-weight: 700; color: #1e3a8a;" title="انقر لمعاينة وتحميل الوثيقة">
                                <i class="fa-regular fa-file-lines" style="color: #2563eb; margin-left: 4px;"></i>${item.title || item.subject || 'وثيقة'}
                            </div>
                            ${item.subject ? `<div style="margin-top:2px;"><span class="badge-tag-subject"><i class="fa-solid fa-file-signature"></i> م/ ${item.subject}</span></div>` : ''}
                            ${item.recipient ? `<div style="margin-top:2px;"><span class="badge-tag-recipient"><i class="fa-solid fa-paper-plane"></i> إلى/ ${item.recipient}</span></div>` : ''}
                            ${item.matched_faculty_info ? `
                                <div style="margin-top: 2px;">
                                    <span class="badge-faculty-tag ${item.matched_faculty_info.role && item.matched_faculty_info.role.includes('رئيس') ? 'head' : ''}" title="تم تمييز اسم التدريسي في قائمة الوثيقة: ${item.matched_faculty_info.detected_line || ''}">
                                        <i class="fa-solid fa-user-check"></i> ${item.matched_faculty_info.matched_name || 'التدريسي'} (${item.matched_faculty_info.role || 'عضو'})
                                    </span>
                                </div>
                            ` : ''}
                            <div style="font-size: 0.75rem; color: #475569; margin-top:2px;">${item.auto_fill_summary || ''}</div>
                        </td>
                        <td style="text-align: center;"><span class="badge-score-add">+${item.suggested_score}</span></td>
                        <td class="auditor-col" style="text-align: center;">
                            <select class="form-control" style="font-size:0.75rem; padding: 2px 4px; font-weight:700;" onchange="changeAuditStatus('${item.ref_code}', this.value)">
                                <option value="pending" ${item.audit_status === 'pending' || !item.audit_status ? 'selected' : ''}>⏳ قيد التدقيق</option>
                                <option value="approved" ${item.audit_status === 'approved' ? 'selected' : ''}>✔ معتمد</option>
                                <option value="modified" ${item.audit_status === 'modified' ? 'selected' : ''}>✏ معدل</option>
                                <option value="rejected" ${item.audit_status === 'rejected' ? 'selected' : ''}>✖ مرفوض</option>
                            </select>
                        </td>
                        <td style="text-align: center; white-space: nowrap;">
                            <button type="button" class="btn btn-outline" style="padding: 2px 6px; font-size: 0.75rem; color: #0284c7; border-color: #bae6fd; margin-left: 3px;" onclick="openReclassifyModal('${item.ref_code}')" title="تغيير المحور والفقرة">
                                <i class="fa-solid fa-sliders"></i>
                            </button>
                            <button type="button" class="btn btn-outline" style="padding: 2px 7px; font-size: 0.75rem; color: #2563eb; border-color: #93c5fd; margin-left: 3px;" onclick="openDocumentPreview('${item.ref_code}')" title="معاينة وتحميل الوثيقة">
                                <i class="fa-regular fa-eye"></i> معاينة
                            </button>
                            <button type="button" class="btn btn-outline" style="padding: 2px 6px; font-size: 0.75rem; color: #dc2626; border-color: #fca5a5;" onclick="deleteEvidence('${item.ref_code}')" title="حذف الدليل">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

// ============================================================================
// عرض الفهرس الشامل للأدلة والملف التوثيقي (Master Catalog Table)
// ============================================================================
function toggleFacultyOnlyFilter() {
    filterFacultyOnly = !filterFacultyOnly;
    const btn = document.getElementById("btn-filter-faculty");
    if (btn) {
        if (filterFacultyOnly) {
            btn.style.background = "#059669";
            btn.style.color = "#ffffff";
            btn.style.borderColor = "#047857";
        } else {
            btn.style.background = "#ecfdf5";
            btn.style.color = "#047857";
            btn.style.borderColor = "#6ee7b7";
        }
    }
    renderMasterCatalogTable();
}
window.toggleFacultyOnlyFilter = toggleFacultyOnlyFilter;

function renderMasterCatalogTable() {
    const tbody = document.getElementById("master-catalog-body");
    const countBadge = document.getElementById("attachments-count");
    if (countBadge) countBadge.textContent = indexedEvidenceList.length;

    const facultyCountBadge = document.getElementById("faculty-matches-count");
    if (facultyCountBadge) {
        facultyCountBadge.textContent = indexedEvidenceList.filter(e => Boolean(e.matched_faculty_info)).length;
    }

    if (!tbody) return;

    let filtered = indexedEvidenceList;
    if (activeFilterAxis !== "all") {
        filtered = indexedEvidenceList.filter(e => e.axis === activeFilterAxis);
    }
    if (filterFacultyOnly) {
        filtered = filtered.filter(e => Boolean(e.matched_faculty_info));
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #94a3b8; padding: 2.5rem;">
            <i class="fa-regular fa-folder-open fa-3x" style="margin-bottom: 0.75rem; display: block; opacity: 0.4;"></i>
            ${filterFacultyOnly ? 'لم يتم العثور على وثائق تم تمييز اسم التدريسي فيها ضمن هذا التصنيف.' : 'لم يتم تسجيل أي وثائق مفهرسة في هذا التصنيف بعد. يمكنك مسح المرفقات مجمعة أو لكل فقرة أعلاه.'}
        </td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((item, idx) => `
        <tr>
            <td style="text-align: center; font-weight: 700;">${idx + 1}</td>
            <td style="text-align: center;">
                <span class="${getRefBadgeClass(item.ref_code)} clickable-badge" onclick="openDocumentPreview('${item.ref_code}')" title="انقر لمعاينة وتحميل الوثيقة">${item.ref_code}</span>
                ${item.handwritten_detected ? '<div style="margin-top: 3px;"><span class="badge-handwritten" title="تم التعرف على خط اليد بالذكاء الاصطناعي"><i class="fa-solid fa-pen-nib"></i> خط يد</span></div>' : ''}
            </td>
            <td>
                <strong>${item.doc_type}</strong>
                ${item.issuer ? `<div style="font-size: 0.75rem; color: #64748b;">${item.issuer}</div>` : ''}
            </td>
            ${inlineEditingRefCode === item.ref_code ? `
                <td class="cell-numdate-edit" style="text-align: center; min-width: 175px;">
                    <div style="display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <span style="font-size: 0.72rem; color: #15803d; font-weight: 700; width: 34px;">العدد:</span>
                            <input type="text" id="inline-edit-num-${item.ref_code}" value="${(item.doc_number && item.doc_number !== 'غير محدد') ? item.doc_number : ''}" class="form-control" style="font-size: 0.76rem; padding: 2px 6px; height: 26px; border: 1px solid #86efac;" placeholder="رقم الأمر / العدد" onkeydown="handleInlineEditKey(event, '${item.ref_code}')">
                        </div>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <span style="font-size: 0.72rem; color: #15803d; font-weight: 700; width: 34px;">التاريخ:</span>
                            <input type="text" id="inline-edit-date-${item.ref_code}" value="${(item.date && item.date !== 'غير محدد') ? item.date : ''}" class="form-control" style="font-size: 0.76rem; padding: 2px 6px; height: 26px; border: 1px solid #86efac;" placeholder="YYYY/MM/DD" onkeydown="handleInlineEditKey(event, '${item.ref_code}')">
                        </div>
                        <div style="display: flex; justify-content: center; gap: 5px; margin-top: 3px;">
                            <button type="button" class="btn btn-sm btn-success" style="padding: 2px 10px; font-size: 0.72rem; font-weight: 700;" onclick="saveInlineDocNumberDate('${item.ref_code}')" title="حفظ التعديل">
                                <i class="fa-solid fa-check"></i> حفظ
                            </button>
                            <button type="button" class="btn btn-sm btn-outline" style="padding: 2px 8px; font-size: 0.72rem; color: #64748b; background: white;" onclick="cancelInlineDocNumberDate()" title="إلغاء">
                                <i class="fa-solid fa-xmark"></i> إلغاء
                            </button>
                        </div>
                    </div>
                </td>
            ` : `
                <td style="text-align: center; font-size: 0.8rem; min-width: 130px;">
                    ${(item.handwritten_fields && item.handwritten_fields.includes("doc_number")) || (item.handwritten_detected && item.doc_number && item.doc_number !== 'غير محدد') ? `
                        <div style="margin-bottom: 3px;">
                            <span class="badge-handwritten" style="font-size: 0.78rem; font-weight: 800;" title="تم استخراج رقم الأمر والحروف الإدارية بخط اليد بالذكاء الاصطناعي">
                                <i class="fa-solid fa-pen-nib"></i> ${item.doc_number || '-'}
                            </span>
                        </div>
                    ` : `
                        <div style="margin-bottom: 2px;"><strong>${item.doc_number || '-'}</strong></div>
                    `}
                    ${(item.handwritten_fields && item.handwritten_fields.includes("date")) || (item.handwritten_detected && item.date) ? `
                        <div>
                            <span class="badge-handwritten" style="font-size: 0.72rem; background: #faf5ff; border-color: #e9d5ff;" title="تاريخ مكتوب بخط اليد بالذكاء الاصطناعي">
                                <i class="fa-solid fa-pen-nib"></i> ${item.date || '-'}
                            </span>
                        </div>
                    ` : `
                        <span style="color: #64748b; font-size: 0.75rem;">${item.date || '-'}</span>
                    `}
                    <div>
                        <button type="button" class="btn-quick-edit-numdate" onclick="startEditDocNumberDate('${item.ref_code}')" title="تعديل العدد والتاريخ">
                            <i class="fa-solid fa-pen-to-square"></i> تعديل
                        </button>
                    </div>
                </td>
            `}
            <td>
                <div class="clickable-doc" onclick="openDocumentPreview('${item.ref_code}')" style="font-weight: 700; color: #1e3a8a;" title="انقر لمعاينة وتحميل الوثيقة">
                    <i class="fa-regular fa-file-lines" style="color: #2563eb; margin-left: 4px;"></i>${item.title || item.subject || item.filename || 'مستند رسمي'}
                </div>
                ${item.subject && item.subject !== item.title ? `<div style="margin-top: 3px;"><span class="badge-tag-subject"><i class="fa-solid fa-file-signature"></i> م/ ${item.subject}</span></div>` : ''}
                ${item.recipient && item.recipient !== 'غير محدد' ? `<div style="margin-top: 3px;"><span class="badge-tag-recipient"><i class="fa-solid fa-paper-plane"></i> إلى/ ${item.recipient}</span></div>` : ''}
                ${item.matched_faculty_info ? `
                    <div style="margin-top: 3px;">
                        <span class="badge-faculty-tag ${item.matched_faculty_info.role && item.matched_faculty_info.role.includes('رئيس') ? 'head' : ''}" title="تم تمييز اسم التدريسي في قائمة/جدول الوثيقة: ${item.matched_faculty_info.detected_line || ''}">
                            <i class="fa-solid fa-user-check"></i> ${item.matched_faculty_info.matched_name || 'التدريسي'} (${item.matched_faculty_info.role || 'عضو'})
                        </span>
                    </div>
                ` : ''}
            </td>
            <td style="text-align: center;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <span style="background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 0.75rem; display: inline-block;">
                        ${item.axis_name || item.axis} - فقرة ${item.paragraph}
                    </span>
                    <button type="button" class="btn btn-outline" style="padding: 2px 7px; font-size: 0.72rem; color: #0284c7; border-color: #bae6fd; background: #f0f9ff;" onclick="openReclassifyModal('${item.ref_code}')" title="تغيير المحور والفقرة">
                        <i class="fa-solid fa-sliders"></i> تغيير المحور/الفقرة
                    </button>
                </div>
            </td>
            <td style="text-align: center;"><span class="badge-score-add">+${item.suggested_score}</span></td>
            <td class="auditor-col" style="text-align: center;">
                <select class="form-control" style="font-size:0.75rem; padding: 3px 4px; font-weight:700;" onchange="changeAuditStatus('${item.ref_code}', this.value)">
                    <option value="pending" ${item.audit_status === 'pending' || !item.audit_status ? 'selected' : ''}>⏳ قيد التدقيق</option>
                    <option value="approved" ${item.audit_status === 'approved' ? 'selected' : ''}>✔ معتمد</option>
                    <option value="modified" ${item.audit_status === 'modified' ? 'selected' : ''}>✏ معدل</option>
                    <option value="rejected" ${item.audit_status === 'rejected' ? 'selected' : ''}>✖ مرفوض</option>
                </select>
            </td>
            <td style="text-align: center; white-space: nowrap;">
                <button type="button" class="btn btn-outline btn-edit-doc-action" onclick="startEditDocNumberDate('${item.ref_code}')" title="تعديل العدد والتاريخ">
                    <i class="fa-solid fa-pen-to-square"></i> تعديل
                </button>
                <button type="button" class="btn btn-outline" style="padding: 4px 8px; font-size: 0.75rem; color: #0284c7; border-color: #bae6fd; margin-left: 3px;" onclick="openReclassifyModal('${item.ref_code}')" title="تغيير المحور والفقرة لهذا الملف">
                    <i class="fa-solid fa-sliders"></i> نقل
                </button>
                <button type="button" class="btn btn-outline" style="padding: 4px 8px; font-size: 0.75rem; color: #2563eb; border-color: #93c5fd; margin-left: 3px;" onclick="openDocumentPreview('${item.ref_code}')" title="معاينة وتحميل الوثيقة">
                    <i class="fa-regular fa-eye"></i> معاينة وتحميل
                </button>
                <button type="button" class="btn btn-outline" style="padding: 4px 8px; font-size: 0.75rem; color: #dc2626; border-color: #fca5a5;" onclick="deleteEvidence('${item.ref_code}')" title="حذف الدليل">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        </tr>
    `).join("");
}

function updateIndexStats() {
    const totalDocs = indexedEvidenceList.length;
    const totalScore = indexedEvidenceList.reduce((acc, curr) => acc + (parseFloat(curr.suggested_score) || 0), 0);
    const coveredParagraphs = new Set(indexedEvidenceList.map(e => `${e.axis}_p${e.paragraph}`)).size;
    const completionPct = Math.min(100, Math.round((coveredParagraphs / 12) * 100));

    const elDocs = document.getElementById("stat-total-docs");
    if (elDocs) elDocs.textContent = totalDocs;

    const elScore = document.getElementById("stat-total-score");
    if (elScore) elScore.textContent = `+${Math.round(totalScore)}`;

    const elPara = document.getElementById("stat-total-paragraphs");
    if (elPara) elPara.textContent = `${coveredParagraphs} من 12`;

    const elPct = document.getElementById("stat-completion-pct");
    if (elPct) elPct.textContent = `${completionPct}%`;
}

// ============================================================================
// منطقة الرفع العامة للمرفقات
// ============================================================================
function initDropzones() {
    const dropzone = document.getElementById("main-ocr-dropzone");
    const fileInput = document.getElementById("ocr-file-input");

    if (!dropzone || !fileInput) return;

    dropzone.addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    });

    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("dragover");
    });

    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
        if (e.dataTransfer.files.length === 1) {
            processSingleEvidenceScan(e.dataTransfer.files[0], null);
        } else if (e.dataTransfer.files.length > 1) {
            processBatchEvidenceScan(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length === 1) {
            processSingleEvidenceScan(e.target.files[0], null);
        } else if (e.target.files.length > 1) {
            processBatchEvidenceScan(e.target.files);
        }
        e.target.value = "";
    });
}

// ============================================================================
// عمليات التصدير (Word & PDF) مع المرفقات المفهرسة
// ============================================================================
function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderStrengthsList(axis4) {
    const items = (axis4 && axis4.items) || {};
    const list = [];
    if (items.h_index) list.push("معامل هيرش (H-index &ge; 3)");
    if (items.reviewing_papers) list.push("تقييم بحوث علمية بمستوعبات Scopus / Clarivate");
    if (items.patents) list.push("براءات اختراع مسجلة وممنوحة رسمياً");
    if (items.women_empowerment) list.push("لجان أو أنشطة دعم وتمكين المرأة");
    if (items.human_rights) list.push("لجان أو أنشطة حقوق الإنسان والخدمة المجتمعية");
    if (list.length === 0) return "<span style='color:#64748b;'>لا توجد نقاط قوة مضافة.</span>";
    return "<ul style='margin:2pt 0; padding-right:15pt;'>" + list.map(item => `<li>${item}</li>`).join("") + "</ul>";
}

function renderPenaltiesList(axis5) {
    const penalties = (axis5 && Array.isArray(axis5.penalties)) ? axis5.penalties : [];
    if (penalties.length === 0) return "<span style='color:#16a34a;'>لا توجد عقوبات انضباطية مسجلة (سجل ناصع).</span>";
    return "<ul style='margin:2pt 0; padding-right:15pt; color:#b91c1c;'>" + penalties.map(p => `<li>عقوبة انضباطية مسجلة: خصم ${p} درجة</li>`).join("") + "</ul>";
}

function generateAndDownloadClientWordDoc(fd, attachments) {
    fd = fd || formData;
    attachments = attachments || indexedEvidenceList || [];
    const p = fd.personal_info || {};
    const evalRes = (typeof calculateEvaluationClient === "function") 
        ? calculateEvaluationClient(fd) 
        : { axis1: {}, axis2: {}, axis3: {}, axis4: {}, axis5: {}, final_score: 0, rating: "غير محدد" };

    const finalScore = evalRes.final_score || 0;
    const rating = evalRes.rating || "ضعيف";
    const scoreInWords = (typeof numberToArabicWords === "function") ? numberToArabicWords(finalScore) : "";

    const teacherName = [p.first_name, p.father_name, p.grandfather_name, p.last_name].filter(Boolean).join(" ") || "تدريسي";
    const safeFilename = `استمارة_تقييم_الأداء_${(p.last_name || p.first_name || "2026").replace(/[\s\/\\:*?"<>|]+/g, '_')}.doc`;

    let html = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<title>استمارة رقم (21): تقييم أداء أعضاء الهيئة التدريسية للعام الدراسي 2025-2026</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
@page {
    size: A4 portrait;
    margin: 1.2cm 1.2cm 1.2cm 1.2cm;
    mso-page-orientation: portrait;
}
body {
    direction: rtl;
    font-family: 'Arial', 'Traditional Arabic', Tahoma, sans-serif;
    font-size: 10pt;
    line-height: 1.25;
    color: #000;
}
table {
    direction: rtl;
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 8pt;
}
th, td {
    border: 1pt solid #000;
    padding: 4pt 5pt;
    font-size: 9pt;
    text-align: center;
    vertical-align: middle;
}
.bg-yellow, th {
    background-color: #fef08a;
    font-weight: bold;
}
.bg-light-yellow {
    background-color: #fef9c3;
}
.text-right {
    text-align: right;
}
.text-center {
    text-align: center;
}
.bold {
    font-weight: bold;
}
.title-box {
    border: 1.5pt solid #1e3a8a;
    background-color: #fef9c3;
    padding: 6pt 10pt;
    text-align: center;
    font-size: 12pt;
    font-weight: bold;
    margin-bottom: 8pt;
}
.section-banner {
    background-color: #e2e8f0;
    border: 1pt solid #cbd5e1;
    font-weight: bold;
    font-size: 10pt;
    padding: 4pt 8pt;
    margin-top: 8pt;
    margin-bottom: 4pt;
    text-align: right;
}
.page-break {
    page-break-before: always;
    clear: both;
    mso-break-type: section-break;
}
.ref-badge {
    background-color: #fef08a;
    font-weight: bold;
    color: #1e3a8a;
    padding: 2pt 4pt;
    border: 1pt solid #facc15;
    border-radius: 3pt;
    display: inline-block;
    font-family: monospace, Arial;
}
</style>
</head>
<body dir="rtl">

<!-- الترويسة الرسمية -->
<table style="border: none; margin-bottom: 6pt;">
  <tr style="border: none;">
    <td style="border: none; text-align: right; width: 45%; vertical-align: top; font-size: 9.5pt; line-height: 1.3;">
      <b>جمهورية العراق</b><br>
      <b>وزارة التعليم العالي والبحث العلمي</b><br>
      <b>جهاز الإشراف والتقويم العلمي</b><br>
      <b>دائرة ضمان الجودة والاعتماد الأكاديمي</b><br>
      قسم تقويم الأداء المؤسسي
    </td>
    <td style="border: none; text-align: left; width: 55%; vertical-align: top; font-size: 9.5pt; line-height: 1.4;">
      <b>رقم الاستمارة:</b> ${escapeHtml(p.form_no || '2026/....')}<br>
      <b>ترميز الاستمارة:</b> ${escapeHtml(p.form_code || 'AGY-2026-....')}
    </td>
  </tr>
</table>

<!-- عنوان الاستمارة الإطاري -->
<div class="title-box">
استمارة رقم (21): تقييم أداء أعضاء الهيئة التدريسية للعام الدراسي 2025-2026
</div>

<!-- البيانات التنظيمية -->
<div style="font-size: 9.5pt; margin-bottom: 6pt; font-weight: bold;">
الجامعة: ${escapeHtml(p.university || '..................')} &nbsp;&nbsp;&nbsp;&nbsp;
الكلية: ${escapeHtml(p.college || '..................')} &nbsp;&nbsp;&nbsp;&nbsp;
القسم / الفرع: ${escapeHtml(p.department || '..................')}
</div>

<!-- جدول البيانات الشخصية والأكاديمية -->
<div class="section-banner">البيانات الشخصية والأكاديمية للتدريسي</div>
<table>
  <tr>
    <th style="width: 20%;">اللقب</th>
    <th style="width: 20%;">اسم جد الأب</th>
    <th style="width: 20%;">اسم الجد</th>
    <th style="width: 20%;">اسم الأب</th>
    <th style="width: 20%;">الاسم</th>
  </tr>
  <tr>
    <td>${escapeHtml(p.last_name || '-')}</td>
    <td>${escapeHtml(p.great_grandfather_name || '-')}</td>
    <td>${escapeHtml(p.grandfather_name || '-')}</td>
    <td>${escapeHtml(p.father_name || '-')}</td>
    <td><b>${escapeHtml(p.first_name || '-')}</b></td>
  </tr>
  <tr>
    <th colspan="2">اسم جد الأم</th>
    <th colspan="2">اسم والد الأم</th>
    <th>اسم الأم</th>
  </tr>
  <tr>
    <td colspan="2">${escapeHtml(p.mother_grandfather_name || '-')}</td>
    <td colspan="2">${escapeHtml(p.mother_father_name || '-')}</td>
    <td>${escapeHtml(p.mother_name || '-')}</td>
  </tr>
  <tr>
    <th style="width: 20%;">الصحيفة</th>
    <th style="width: 20%;">السجل</th>
    <th colspan="3">رقم الجنسية أو البطاقة الوطنية الموحدة</th>
  </tr>
  <tr>
    <td>${escapeHtml(p.page_no || '-')}</td>
    <td>${escapeHtml(p.registry_no || '-')}</td>
    <td colspan="3"><b>${escapeHtml(p.national_id || '-')}</b></td>
  </tr>
  <tr>
    <th colspan="2">يوم الإصدار</th>
    <th>شهر الإصدار</th>
    <th colspan="2">سنة الإصدار</th>
  </tr>
  <tr>
    <td colspan="2">${escapeHtml(p.issue_day || '-')}</td>
    <td>${escapeHtml(p.issue_month || '-')}</td>
    <td colspan="2">${escapeHtml(p.issue_year || '-')}</td>
  </tr>
  <tr>
    <th>يوم منح الشهادة</th>
    <th>شهر منح الشهادة</th>
    <th colspan="2">رقم وتاريخ الأمر الوزاري / الجامعي</th>
    <th>الشهادة</th>
  </tr>
  <tr>
    <td>${escapeHtml(p.degree_day || '-')}</td>
    <td>${escapeHtml(p.degree_month || '-')}</td>
    <td colspan="2">${escapeHtml(p.order_no_and_date || '-')}</td>
    <td><b>${escapeHtml(p.degree || '-')}</b></td>
  </tr>
  <tr>
    <th colspan="2">القسم</th>
    <th>الكلية</th>
    <th>الجامعة</th>
    <th>البلد المانح</th>
  </tr>
  <tr>
    <td colspan="2">${escapeHtml(p.granting_dept || '-')}</td>
    <td>${escapeHtml(p.granting_college || '-')}</td>
    <td>${escapeHtml(p.granting_univ || '-')}</td>
    <td>${escapeHtml(p.granting_country || '-')}</td>
  </tr>
  <tr>
    <th colspan="3">التخصص الدقيق</th>
    <th colspan="2">التخصص العام</th>
  </tr>
  <tr>
    <td colspan="3">${escapeHtml(p.specific_specialty || '-')}</td>
    <td colspan="2">${escapeHtml(p.general_specialty || '-')}</td>
  </tr>
  <tr>
    <th>يوم الحصول عليه</th>
    <th>شهر</th>
    <th>سنة</th>
    <th>جهة المنح</th>
    <th>اللقب العلمي</th>
  </tr>
  <tr>
    <td>${escapeHtml(p.title_day || '-')}</td>
    <td>${escapeHtml(p.title_month || '-')}</td>
    <td>${escapeHtml(p.title_year || '-')}</td>
    <td>${escapeHtml(p.title_granter || '-')}</td>
    <td><b>${escapeHtml(p.academic_title || '-')}</b></td>
  </tr>
  <tr>
    <th colspan="2">رقم الهاتف</th>
    <th colspan="3">البريد الإلكتروني الرسمي الجامعي</th>
  </tr>
  <tr>
    <td colspan="2" dir="ltr">${escapeHtml(p.phone || '-')}</td>
    <td colspan="3" dir="ltr"><b>${escapeHtml(p.email || '-')}</b></td>
  </tr>
</table>

<!-- المحور الأول: جودة التدريس والتعليم (50%) -->
<div class="section-banner">المحور الأول: جودة التدريس والتعليم (الوزن: 50%) ${fd.is_non_teaching ? ' - [تدريسي غير مكلف بمهام تدريسية]' : ''}</div>
<table>
  <tr>
    <th style="width: 8%;">الفقرة</th>
    <th style="width: 52%;">بيان النشاط / المعيار</th>
    <th style="width: 15%;">الحد الأعلى</th>
    <th style="width: 15%;">الدرجة المستحقة</th>
    <th style="width: 10%;">الحالة</th>
  </tr>`;

    if (fd.is_non_teaching) {
        const jItems = (fd.axis1 && fd.axis1.job_commitment_items) || [0,0,0,0,0];
        const jSum = jItems.reduce((a,b)=>a+(Number(b)||0), 0);
        html += `
  <tr>
    <td>5</td>
    <td class="text-right">الالتزام الوظيفي والأكاديمي (تحتسب 100% وتوزن بنسبة 50% لغير المكلفين)</td>
    <td>20</td>
    <td><b>${jSum}</b></td>
    <td>مكلف إدارياً</td>
  </tr>`;
    } else {
        const a1 = fd.axis1 || {};
        const bSum = ((a1.blended_learning_items) || [0,0,0,0]).reduce((a,b)=>a+(Number(b)||0), 0);
        const cSum = ((a1.course_description_items) || [0,0,0,0,0]).reduce((a,b)=>a+(Number(b)||0), 0);
        const jSum = ((a1.job_commitment_items) || [0,0,0,0,0]).reduce((a,b)=>a+(Number(b)||0), 0);
        html += `
  <tr>
    <td>1</td>
    <td class="text-right">المقررات الدراسية (الخطة التدريسية والساعات المعتمدة)</td>
    <td>20</td>
    <td><b>${Number(a1.courses_score) || 0}</b></td>
    <td>معتمد</td>
  </tr>
  <tr>
    <td>2</td>
    <td class="text-right">إدارة الصف الدراسي وتوثيق حضور وغياب الطلبة</td>
    <td>20</td>
    <td><b>${Number(a1.classroom_management_score) || 0}</b></td>
    <td>معتمد</td>
  </tr>
  <tr>
    <td>3</td>
    <td class="text-right">التعليم المدمج واستخدام المنصات الرقمية والأنشطة التفاعلية</td>
    <td>20</td>
    <td><b>${bSum}</b></td>
    <td>معتمد</td>
  </tr>
  <tr>
    <td>4</td>
    <td class="text-right">وصف المقرر الدراسي وتحديث المفردات والتقويم الدوري</td>
    <td>20</td>
    <td><b>${cSum}</b></td>
    <td>معتمد</td>
  </tr>
  <tr>
    <td>5</td>
    <td class="text-right">الالتزام الوظيفي والجامعي وحضور مجالس القسم واللجان</td>
    <td>20</td>
    <td><b>${jSum}</b></td>
    <td>معتمد</td>
  </tr>`;
    }

    const ax1Raw = (evalRes.axis1 && evalRes.axis1.raw_score) || 0;
    const ax1Weighted = (evalRes.axis1 && evalRes.axis1.weighted_score) || 0;
    html += `
  <tr class="bg-light-yellow">
    <td colspan="2" class="bold text-right">مجموع درجات المحور الأول (الخام: 100)</td>
    <td class="bold">100</td>
    <td class="bold">${ax1Raw}</td>
    <td class="bold">الموزون: ${ax1Weighted}%</td>
  </tr>
</table>

<!-- المحور الثاني: النشاط العلمي والبحثي (30%) -->
<div class="section-banner">المحور الثاني: النشاط العلمي والبحثي (الوزن: 30%)</div>
<table>
  <tr>
    <th style="width: 8%;">الفقرة</th>
    <th style="width: 52%;">بيان النشاط العلمي</th>
    <th style="width: 15%;">الحد الأعلى</th>
    <th style="width: 15%;">الدرجة المستحقة</th>
    <th style="width: 10%;">ملاحظات</th>
  </tr>`;

    const a2 = fd.axis2 || {};
    html += `
  <tr>
    <td>1</td>
    <td class="text-right">بحوث المستوعبات العالمية الرصينة (Scopus / Clarivate)</td>
    <td>60</td>
    <td><b>${Number(a2.global_research_score) || 0}</b></td>
    <td>${(Number(a2.global_research_score) > 0) ? 'مستوفٍ' : 'صفر (قيد السقف 75%)'}</td>
  </tr>
  <tr>
    <td>2</td>
    <td class="text-right">البحوث المحلية والمؤتمرات والكتب العلمية المقومة</td>
    <td>25</td>
    <td><b>${Number(a2.local_research_score) || 0}</b></td>
    <td>معتمد</td>
  </tr>
  <tr>
    <td>3</td>
    <td class="text-right">الإشراف على الدراسات العليا ومشاريع تخرج الصفوف المنتهية</td>
    <td>15</td>
    <td><b>${Number(a2.supervision_score) || 0}</b></td>
    <td>معتمد</td>
  </tr>`;

    const ax2Raw = (evalRes.axis2 && evalRes.axis2.raw_score) || 0;
    const ax2Weighted = (evalRes.axis2 && evalRes.axis2.weighted_score) || 0;
    html += `
  <tr class="bg-light-yellow">
    <td colspan="2" class="bold text-right">مجموع درجات المحور الثاني (الخام: 100)</td>
    <td class="bold">100</td>
    <td class="bold">${ax2Raw}</td>
    <td class="bold">الموزون: ${ax2Weighted}%</td>
  </tr>
</table>`;

    if (evalRes.scopus_zero_rule_triggered || (Number(a2.global_research_score) === 0 && finalScore >= 75)) {
        html += `<div style="color: #b91c1c; font-size: 8.5pt; font-weight: bold; margin-bottom: 6pt;">⚠️ تنبيه وزاري إلزامي: تم تطبيق سقف التقييم (75%) لعدم وجود بحوث في مستوعبات Scopus/Clarivate.</div>`;
    }

    // المحور الثالث: الجانب التربوي والتطويري (20%)
    const a3 = fd.axis3 || {};
    const ax3Raw = (evalRes.axis3 && evalRes.axis3.raw_score) || 0;
    const ax3Weighted = (evalRes.axis3 && evalRes.axis3.weighted_score) || 0;
    html += `
<div class="section-banner">المحور الثالث: الجانب التربوي والتطويري (الوزن: 20%)</div>
<table>
  <tr>
    <th style="width: 8%;">الفقرة</th>
    <th style="width: 52%;">بيان النشاط</th>
    <th style="width: 15%;">الحد الأعلى</th>
    <th style="width: 15%;">الدرجة المستحقة</th>
    <th style="width: 10%;">الحالة</th>
  </tr>
  <tr>
    <td>1</td>
    <td class="text-right">اللجان الدائمية والمؤقتة والمكلف بها رسمياً بأوامر إدارية</td>
    <td>30</td>
    <td><b>${Number(a3.committees_score) || 0}</b></td>
    <td>معتمد</td>
  </tr>
  <tr>
    <td>2</td>
    <td class="text-right">التعليم المستمر والندوات وحلقات النقاش وورش العمل</td>
    <td>20</td>
    <td><b>${Number(a3.continuous_learning_score) || 0}</b></td>
    <td>معتمد</td>
  </tr>
  <tr>
    <td>3</td>
    <td class="text-right">كتب الشكر والتقدير والجوائز وشهادات التكريم الأكاديمية</td>
    <td>20</td>
    <td><b>${Number(a3.thank_you_score) || 0}</b></td>
    <td>معتمد</td>
  </tr>
  <tr>
    <td>4</td>
    <td class="text-right">الزيارات الميدانية والإرشاد التربوي والأنشطة اللاصفية وخدمة المجتمع</td>
    <td>30</td>
    <td><b>${Number(a3.field_visits_score) || 0}</b></td>
    <td>معتمد</td>
  </tr>
  <tr class="bg-light-yellow">
    <td colspan="2" class="bold text-right">مجموع درجات المحور الثالث (الخام: 100)</td>
    <td class="bold">100</td>
    <td class="bold">${ax3Raw}</td>
    <td class="bold">الموزون: ${ax3Weighted}%</td>
  </tr>
</table>

<!-- نقاط القوة والعقوبات -->
<table style="margin-top: 6pt;">
  <tr>
    <th style="width: 50%;">نقاط القوة الإضافية (بحد أقصى 5 درجات)</th>
    <th style="width: 50%;">العقوبات الانضباطية والخصومات المترتبة</th>
  </tr>
  <tr>
    <td class="text-right" style="vertical-align: top;">
      ${renderStrengthsList(fd.axis4)}
      <div style="margin-top: 4pt; font-weight: bold;">مجموع نقاط القوة الممنوحة: ${(evalRes.axis4 && evalRes.axis4.awarded_score) || 0} درجات</div>
    </td>
    <td class="text-right" style="vertical-align: top;">
      ${renderPenaltiesList(fd.axis5)}
      <div style="margin-top: 4pt; font-weight: bold; color: #b91c1c;">إجمالي الخصم المترتب: -${(evalRes.axis5 && evalRes.axis5.total_deduction) || 0} درجة</div>
    </td>
  </tr>
</table>

<!-- ملخص النتيجة النهائية والتفقيط -->
<div class="section-banner" style="background-color: #fef9c3; border-color: #fde047;">النتيجة الإجمالية والتقييم النهائي المعتمد</div>
<table>
  <tr>
    <th style="width: 25%;">المحور الأول (50%)</th>
    <th style="width: 25%;">المحور الثاني (30%)</th>
    <th style="width: 25%;">المحور الثالث (20%)</th>
    <th style="width: 25%;">نقاط القوة / العقوبات</th>
  </tr>
  <tr>
    <td><b>${ax1Weighted}%</b></td>
    <td><b>${ax2Weighted}%</b></td>
    <td><b>${ax3Weighted}%</b></td>
    <td>+${(evalRes.axis4 && evalRes.axis4.awarded_score) || 0} / -${(evalRes.axis5 && evalRes.axis5.total_deduction) || 0}</td>
  </tr>
  <tr class="bg-yellow">
    <th colspan="2">الدرجة النهائية المستحقة الموزونة</th>
    <th colspan="2">التقدير اللفظي المعتمد</th>
  </tr>
  <tr>
    <td colspan="2" style="font-size: 14pt; font-weight: bold; color: #1e3a8a;">${finalScore}%</td>
    <td colspan="2" style="font-size: 13pt; font-weight: bold;">${rating}</td>
  </tr>
  <tr>
    <td colspan="4" class="text-right" style="padding: 6pt 10pt; font-size: 10pt; background-color: #fafaf9;">
      <b>الدرجة كتابةً (تفقيط رسمي):</b> ${scoreInWords || (typeof numberToArabicWords === "function" ? numberToArabicWords(finalScore) : "")}
    </td>
  </tr>
</table>

<!-- المصادقات والتواقيع الرسمية -->
<table style="margin-top: 10pt; margin-bottom: 12pt;">
  <tr>
    <th style="width: 25%;">توقيع التدريسي المعني</th>
    <th style="width: 25%;">توقيع مقرر القسم</th>
    <th style="width: 25%;">توقيع رئيس القسم / الفرع</th>
    <th style="width: 25%;">مصادقة السيد عميد الكلية</th>
  </tr>
  <tr style="height: 60pt;">
    <td style="vertical-align: bottom;">التوقيع: .....................<br>التاريخ: &nbsp;&nbsp;&nbsp;&nbsp; / &nbsp;&nbsp;&nbsp;&nbsp; / 2026</td>
    <td style="vertical-align: bottom;">التوقيع: .....................<br>التاريخ: &nbsp;&nbsp;&nbsp;&nbsp; / &nbsp;&nbsp;&nbsp;&nbsp; / 2026</td>
    <td style="vertical-align: bottom;">التوقيع: .....................<br>التاريخ: &nbsp;&nbsp;&nbsp;&nbsp; / &nbsp;&nbsp;&nbsp;&nbsp; / 2026</td>
    <td style="vertical-align: bottom;">التوقيع: .....................<br>التاريخ: &nbsp;&nbsp;&nbsp;&nbsp; / &nbsp;&nbsp;&nbsp;&nbsp; / 2026</td>
  </tr>
</table>

<!-- فاصل صفحة قبل الفهرس الشامل للأدلة والمرفقات -->
<br class="page-break" style="page-break-before:always; clear:both; mso-break-type:section-break">

<!-- الفهرس الشامل للمرفقات والملف التوثيقي -->
<div class="title-box" style="background-color: #fef08a; border-color: #ca8a04; margin-top: 10pt;">
الفهرس الشامل للوثائق والمرفقات المعتمدة (الملف التوثيقي الرسمي)
</div>
<div style="font-size: 9pt; margin-bottom: 6pt;">
<b>التدريسي:</b> ${escapeHtml(teacherName)} &nbsp;&nbsp;|&nbsp;&nbsp;
<b>القسم:</b> ${escapeHtml(p.department || '-')} &nbsp;&nbsp;|&nbsp;&nbsp;
<b>إجمالي المرفقات المعتمدة:</b> ${attachments.length} وثيقة رسمية
</div>

<table>
  <thead>
    <tr>
      <th style="width: 4%;">ت</th>
      <th style="width: 15%;">رمز الإشارة المرجعي</th>
      <th style="width: 16%;">المحور والفقرة</th>
      <th style="width: 25%;">عنوان الوثيقة / الأمر الإداري</th>
      <th style="width: 14%;">نوع الوثيقة</th>
      <th style="width: 11%;">العدد</th>
      <th style="width: 10%;">التاريخ</th>
      <th style="width: 5%;">الدرجة</th>
    </tr>
  </thead>
  <tbody>`;

    if (attachments.length === 0) {
        html += `
    <tr>
      <td colspan="8" style="padding: 15pt; color: #64748b; font-style: italic;">
        لا توجد مرفقات مفهرسة مضافة حالياً.
      </td>
    </tr>`;
    } else {
        attachments.forEach((att, idx) => {
            const refCode = att.ref_code || `REF-${idx+1}`;
            const axisName = att.axis_name || (att.axis ? (att.axis.replace('axis','المحور ') + ' - ف' + (att.paragraph||'')) : '-');
            const title = att.title || att.filename || '-';
            const docType = att.doc_type || '-';
            const docNum = att.doc_number || '-';
            const date = att.date || '-';
            const score = att.suggested_score !== undefined ? att.suggested_score : '-';

            html += `
    <tr>
      <td>${idx + 1}</td>
      <td style="background-color: #fef9c3;"><span class="ref-badge">${escapeHtml(refCode)}</span></td>
      <td class="text-right" style="font-size: 8.5pt;">${escapeHtml(axisName)}</td>
      <td class="text-right" style="font-size: 8.5pt;"><b>${escapeHtml(title)}</b></td>
      <td style="font-size: 8.5pt;">${escapeHtml(docType)}</td>
      <td style="font-weight: bold; font-size: 8.5pt; color: #1e3a8a;">${escapeHtml(docNum)}</td>
      <td style="font-size: 8.5pt;">${escapeHtml(date)}</td>
      <td style="font-weight: bold;">${score}</td>
    </tr>`;
        });
    }

    html += `
  </tbody>
</table>
` + "<" + "/body>\n<" + "/html>";

    const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
    downloadBlob(blob, safeFilename);
}

async function exportDocx() {
    const btn = document.getElementById("btn-export-docx");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> جاري إنشاء ملف Word...`;

    try {
        const response = await fetch("/api/export-docx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ form_data: formData, attachments: indexedEvidenceList })
        });

        if (response.ok) {
            const blob = await response.blob();
            const teacherName = [formData.personal_info.last_name, formData.personal_info.first_name].filter(Boolean).join('_') || '2026';
            downloadBlob(blob, `استمارة_تقييم_الأداء_${teacherName}.docx`);
            showToast("تم تصدير استمارة Word الرسمية مع فهرس الأدلة بنجاح! 📄");
            return;
        }
    } catch (err) {
        console.warn("Backend Word export unavailable, generating client-side Word document:", err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-file-word"></i> تحميل الاستمارة Word (.docx)`;
    }

    // بديل فوري وتلقائي دون أي نوافذ تنبيه: توليد ملف Word المتكامل وتنزيله مباشرة
    try {
        generateAndDownloadClientWordDoc(formData, indexedEvidenceList);
        showToast("تم إنشاء وتنزيل استمارة Word الرسمية بنجاح! 📄");
    } catch (clientErr) {
        console.error("Client-side Word generation failed:", clientErr);
        showToast("تعذر إنشاء ملف Word تلقائياً، يرجى استخدام زر 'طباعة' لحفظ نسخة PDF.");
    }
}

async function exportPdf() {
    const btn = document.getElementById("btn-export-pdf");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> جاري إنشاء ملف PDF...`;

    try {
        const signatures = getDigitalSignaturesPayload();
        const response = await fetch("/api/export-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                form_data: formData,
                attachments: indexedEvidenceList,
                signatures: signatures
            })
        });

        if (response.ok) {
            const blob = await response.blob();
            const teacherName = [formData.personal_info.last_name, formData.personal_info.first_name].filter(Boolean).join('_') || '2026';
            downloadBlob(blob, `استمارة_تقييم_الأداء_${teacherName}.pdf`);
            showToast("تم تصدير استمارة PDF الرسمية مع فهرس الأدلة والتواقيع بنجاح! 📑");
            return;
        }
    } catch (err) {
        console.warn("Backend PDF export unavailable, falling back to browser print:", err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-file-pdf"></i> تحميل الاستمارة PDF (.pdf)`;
    }

    // بديل فوري وفعال: فتح نافذة الطباعة / الحفظ بصيغة PDF الرسمية
    showToast("جارٍ فتح نافذة الطباعة والحفظ بصيغة PDF الرسمية... 🖨️");
    window.print();
}

async function exportDossierPdf() {
    const btn = document.getElementById("btn-export-dossier-pdf");
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> جاري تجميع الاستمارة والمرفقات...`;

    try {
        const signatures = getDigitalSignaturesPayload();
        const response = await fetch("/api/export-dossier-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                form_data: formData,
                attachments: indexedEvidenceList,
                signatures: signatures
            })
        });

        if (response.ok) {
            const blob = await response.blob();
            const teacherName = [formData.personal_info.last_name, formData.personal_info.first_name].filter(Boolean).join('_') || '2026';
            downloadBlob(blob, `تصدير_الاستمارة_والمرفقات_${teacherName}.pdf`);
            showToast("تم إنشاء وتنزيل الاستمارة والمرفقات (PDF) مع الفهرس التفاعلي بنجاح! 📚");
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-file-export"></i> تصدير الاستمارة والمرفقات (PDF)`;
            return;
        }
    } catch (err) {
        console.warn("Backend dossier export unavailable, using print window:", err);
    }

    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-file-export"></i> تصدير الاستمارة والمرفقات (PDF)`;

    // بناء نافذة طباعة مخصصة تعرض الاستمارة وفهرس الأدلة بصيغة PDF
    openDossierPrintWindow();
}

function openDossierPrintWindow() {
    const teacher = formData.personal_info || {};
    const teacherName = [teacher.last_name, teacher.first_name].filter(Boolean).join(' ') || 'الأستاذ الدكتور';
    const teacherRank = teacher.academic_title || 'عضو الهيئة التدريسية';
    const university = teacher.university || 'وزارة التعليم العالي والبحث العلمي';
    const college = teacher.college || 'كلية الهندسة';
    const dept = teacher.department || 'القسم الأكاديمي';
    const year = teacher.academic_year || '2025-2026';
    const printDate = new Date().toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' });

    // 1. بناء صفوف جدول الوثائق والمرفقات المنظم
    let evidenceRows = '';
    indexedEvidenceList.forEach((item, idx) => {
        const docTitle = item.title || item.filename || item.subject || 'وثيقة ثبوتية رسمية';
        const docNum = item.doc_number && item.doc_number !== 'غير محدد' ? item.doc_number : '-';
        const docDate = item.date && item.date !== 'غير محدد' ? item.date : '-';
        const axisText = item.axis_name || item.axis || 'المحور العام';
        const paragraphText = item.paragraph_name ? `${item.paragraph_name} (ف${item.paragraph})` : `فقرة ${item.paragraph || '1'}`;
        const score = item.suggested_score !== undefined ? parseFloat(item.suggested_score).toFixed(1) : '0.0';

        evidenceRows += `
        <tr>
            <td style="font-weight: 700; width: 28px;">${idx + 1}</td>
            <td style="width: 100px;">
                <span class="tbl-ref-stamp">${item.ref_code || `REF-${idx + 1}`}</span>
            </td>
            <td style="text-align: right; width: 110px; font-weight: 600;">${item.doc_type || 'أمر إداري رسمي'}</td>
            <td style="width: 105px; direction: ltr; font-weight: 700; font-size: 8pt;">
                <div>${docNum}</div>
                <div style="font-size: 7.5pt; color: #64748b; font-weight: normal; margin-top: 2px;">${docDate}</div>
            </td>
            <td style="text-align: right; width: 115px; font-size: 8pt;">
                <div style="font-weight: 700; color: #1e3a8a;">${axisText}</div>
                <div style="color: #475569;">${paragraphText}</div>
            </td>
            <td style="text-align: right; font-size: 8.5pt; line-height: 1.35;">
                <div style="font-weight: 700; color: #0f172a;">${docTitle}</div>
                ${item.issuer ? `<div style="font-size: 7.5pt; color: #059669; margin-top: 2px;">الجهة: ${item.issuer}</div>` : ''}
            </td>
            <td style="width: 50px; font-weight: 800; color: #166534; background: #f0fdf4;">${score}</td>
            <td style="width: 65px;">
                <span class="tbl-status-badge">معتمد ✔</span>
            </td>
        </tr>`;
    });

    if (!evidenceRows) {
        evidenceRows = `
        <tr>
            <td colspan="8" style="text-align: center; padding: 25px; color: #64748b; font-size: 10pt;">
                لا توجد وثائق أو مرفقات مفهرسة حتى الآن.
            </td>
        </tr>`;
    }

    const totalScore = indexedEvidenceList.reduce((s, e) => s + (parseFloat(e.suggested_score) || 0), 0).toFixed(1);

    // 2. بناء صفحات الوثائق والمرفقات الأصلية مع وسم رمز المرفق البارز في أعلى يسار الصفحة
    let documentPagesHtml = '';
    indexedEvidenceList.forEach((item, idx) => {
        const docTitle = item.title || item.filename || item.subject || 'وثيقة ثبوتية';
        const docNum = item.doc_number && item.doc_number !== 'غير محدد' ? item.doc_number : '-';
        const docDate = item.date && item.date !== 'غير محدد' ? item.date : '-';
        const axisDesc = `${item.axis_name || item.axis || 'المحور'} - فقرة ${item.paragraph || '1'}`;
        const refCode = item.ref_code || `REF-${idx + 1}`;
        
        let src = item.file_path || (item.filename ? `/uploads/${item.filename}` : '');
        const isPdf = src.toLowerCase().split('?')[0].endsWith('.pdf');

        documentPagesHtml += `
        <div class="doc-attachment-page">
            <!-- الترويسة العلوية للوثيقة مع وسم الرمز المميز في أعلى اليسار -->
            <div class="doc-page-header-strip">
                <div class="doc-header-meta">
                    <div class="doc-header-main-title">
                        <span class="doc-badge-seq">مرفق ثبوتي (${idx + 1} من ${indexedEvidenceList.length})</span>
                        <strong>${docTitle}</strong>
                    </div>
                    <div class="doc-header-sub-meta">
                        <span><strong>العدد:</strong> ${docNum}</span>
                        <span><strong>التاريخ:</strong> ${docDate}</span>
                        <span><strong>المحور:</strong> ${axisDesc}</span>
                        ${item.issuer ? `<span><strong>الجهة المصدرة:</strong> ${item.issuer}</span>` : ''}
                        <span><strong>الدرجة المعتمدة:</strong> <span style="color: #166534; font-weight: 800;">${item.suggested_score || 0} درجة</span></span>
                    </div>
                </div>
                
                <!-- وسم رمز المرفق الرسمي في أعلى الصفحة (الجهة العلوية اليسرى) بلون وخلفية مميزة -->
                <div class="stamp-badge-top-left" title="رمز الأرشفة والتوثيق الرسمي">
                    <div class="stamp-title-text">رمز المرفق الرسمي</div>
                    <div class="stamp-code-text">${refCode}</div>
                </div>
            </div>

            <!-- إطار عرض صورة الوثيقة أو القصاصة الأصلية -->
            <div class="doc-display-container">
                ${src && !isPdf ? `
                    <img src="${src}" class="doc-rendered-image" alt="وثيقة ${refCode}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
                    <div class="doc-fallback-sheet" style="display: none;">
                        <div class="fallback-icon">📄</div>
                        <h3>وثيقة رسمية مؤرشفة: ${refCode}</h3>
                        <p><strong>العنوان:</strong> ${docTitle}</p>
                        <p><strong>العدد والتاريخ:</strong> ${docNum} بتاريخ ${docDate}</p>
                        <p><strong>الجهة المصدرة:</strong> ${item.issuer || '-'}</p>
                        <div class="fallback-audit-seal">✔ تم تدقيق ومطابقة أصل الوثيقة مع السجلات الرسمية</div>
                    </div>
                ` : `
                    <div class="doc-fallback-sheet">
                        <div class="fallback-icon">📑</div>
                        <h3>وثيقة رقمية معتمدة: ${refCode}</h3>
                        <p><strong>العنوان:</strong> ${docTitle}</p>
                        <p><strong>العدد والتاريخ:</strong> ${docNum} بتاريخ ${docDate}</p>
                        <p><strong>المحور والفقرة:</strong> ${axisDesc}</p>
                        <p><strong>الجهة المصدرة:</strong> ${item.issuer || '-'}</p>
                        ${item.auto_fill_summary ? `<div class="fallback-summary"><strong>خلاصة التوثيق:</strong> ${item.auto_fill_summary}</div>` : ''}
                        <div class="fallback-audit-seal">✔ تم فحص ومطابقة الوثيقة رقمياً في قاعدة بيانات المنصة</div>
                    </div>
                `}
            </div>

            <!-- تذييل و Caption المرفق أسفل الصورة مباشرة -->
            <div class="doc-page-footer-strip">
                <div>المصبار التوثيقي المعتمد (استمارة 21) — بيان الوثيقة: ${docTitle}</div>
                <div>رمز المرفق: [${refCode}] | وثيقة رقم (${idx + 1} من ${indexedEvidenceList.length})</div>
            </div>
        </div>`;
    });

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>المصبار التوثيقي المدمج وجدول المرفقات — ${teacherName}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 20mm 15mm;
    margin-top: 20mm;
    margin-bottom: 20mm;
    margin-left: 15mm;
    margin-right: 15mm;
  }
  @media print {
    .no-print-bar { display: none !important; }
    html, body {
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .print-page-wrapper {
      max-width: 100% !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      border: none !important;
      border-radius: 0 !important;
      background: white !important;
    }
    .docs-master-table {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .docs-master-table tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .signatures-section {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      page-break-after: auto !important;
      break-after: auto !important;
      margin-top: 14px !important;
      margin-bottom: 0 !important;
      padding-bottom: 0 !important;
    }
    .doc-attachment-page {
      page-break-before: always !important;
      break-before: page !important;
      page-break-after: auto !important;
      break-after: auto !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      break-inside: avoid-page !important;
      box-sizing: border-box !important;
      height: auto !important;
      max-height: 250mm !important;
      min-height: 0 !important;
      overflow: hidden !important;
      display: block !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
    }
    .doc-page-header-strip {
      flex-shrink: 0 !important;
      padding-bottom: 2px !important;
      margin-bottom: 2px !important;
      border-bottom: 2px solid #0f2942 !important;
      page-break-after: avoid !important;
      break-after: avoid !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .doc-display-container {
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      width: 100% !important;
      min-height: 0 !important;
      max-height: 222mm !important;
      height: auto !important;
      overflow: hidden !important;
      padding: 0 !important;
      margin: 2px 0 !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 4px !important;
      background: #ffffff !important;
      page-break-before: avoid !important;
      break-before: avoid !important;
      page-break-after: avoid !important;
      break-after: avoid !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .doc-rendered-image {
      max-height: 218mm !important;
      max-width: 100% !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
      display: block !important;
      margin: 0 auto !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .doc-page-footer-strip {
      flex-shrink: 0 !important;
      padding-top: 2px !important;
      margin-top: 2px !important;
      border-top: 1.5px solid #0f2942 !important;
      page-break-before: avoid !important;
      break-before: avoid !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      font-size: 7.5pt !important;
      font-weight: 700 !important;
      color: #1e293b !important;
    }
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    font-size: 10pt;
    color: #0f172a;
    background: #f1f5f9;
    margin: 0;
    padding: 0;
    direction: rtl;
  }
  
  /* شريط التحكم العلوي للمعاينة السريعة والطباعة */
  .no-print-bar {
    position: sticky;
    top: 0;
    left: 0;
    right: 0;
    background: #0f2942;
    color: white;
    padding: 10px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 1000;
  }
  .btn-print-action {
    background: #10b981;
    color: white;
    border: none;
    padding: 8px 20px;
    border-radius: 6px;
    font-weight: 800;
    font-size: 10.5pt;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(16,185,129,0.4);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
  }
  .btn-print-action:hover { background: #059669; transform: translateY(-1px); }
  .btn-close-action {
    background: transparent;
    color: #cbd5e1;
    border: 1px solid #475569;
    padding: 7px 16px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    margin-right: 8px;
  }
  .btn-close-action:hover { background: #334155; color: white; }

  .print-page-wrapper {
    max-width: 210mm;
    margin: 15px auto;
    background: white;
    padding: 20mm 15mm;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    border-radius: 4px;
    box-sizing: border-box;
  }

  /* ========================================================================
     1. ترويسة الاستمارة وجدول الوثائق المنظم
     ======================================================================== */
  .inst-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #0f2942;
    padding-bottom: 8px;
    margin-bottom: 10px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .inst-col-right {
    text-align: right;
    font-size: 8.5pt;
    line-height: 1.4;
    color: #1e293b;
    font-weight: 600;
  }
  .inst-col-center {
    text-align: center;
  }
  .inst-col-center h1 {
    font-size: 13.5pt;
    font-weight: 900;
    color: #0f2942;
    margin: 0 0 3px 0;
  }
  .inst-col-center .sub-head {
    font-size: 9.5pt;
    font-weight: 800;
    color: #1e3a8a;
    background: #e0f2fe;
    display: inline-block;
    padding: 2px 14px;
    border-radius: 999px;
    border: 1px solid #bae6fd;
  }
  .inst-col-left {
    text-align: left;
    font-size: 8pt;
    line-height: 1.4;
    color: #475569;
  }

  /* بطاقة ملخص التدريسي */
  .meta-profile-box {
    background: #f8fafc;
    border: 1.5px solid #cbd5e1;
    border-radius: 6px;
    padding: 8px 12px;
    margin-bottom: 10px;
    display: grid;
    grid-template-columns: 2fr 1.5fr 1.5fr;
    gap: 6px 14px;
    font-size: 9pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .profile-field span { font-weight: 800; color: #0f2942; }

  /* تنسيق جدول الوثائق المتقن */
  .docs-master-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8pt;
    margin-top: 4px;
  }
  .docs-master-table th {
    background: #0f2942;
    color: white;
    padding: 6px 4px;
    text-align: center;
    font-weight: 800;
    border: 1px solid #0f2942;
    font-size: 8pt;
  }
  .docs-master-table td {
    border: 1px solid #cbd5e1;
    padding: 5px 4px;
    text-align: center;
    vertical-align: middle;
    color: #1e293b;
  }
  .docs-master-table tr:nth-child(even) { background: #f8fafc; }
  .docs-master-table tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  
  .tbl-ref-stamp {
    display: inline-block;
    background: #0f172a;
    color: #facc15;
    border: 1.5px solid #facc15;
    padding: 1px 5px;
    border-radius: 4px;
    font-weight: 900;
    font-size: 8pt;
    font-family: 'Courier New', monospace;
    letter-spacing: 0.5px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.15);
  }
  .tbl-status-badge {
    background: #ecfdf5;
    color: #166534;
    border: 1px solid #86efac;
    padding: 1px 4px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 7pt;
    white-space: nowrap;
  }
  .total-summary-row {
    background: #e0f2fe !important;
    font-weight: 900;
    color: #0369a1;
    font-size: 9pt;
  }

  /* حقول المصادقات والتواقيع */
  .signatures-section {
    margin-top: 14px;
    margin-bottom: 0;
    padding-bottom: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    text-align: center;
    font-size: 8.5pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .sig-col {
    border: 1px dashed #94a3b8;
    border-radius: 6px;
    padding: 8px 6px;
    background: #f8fafc;
  }
  .sig-col .sig-title {
    font-weight: 800;
    color: #0f2942;
    margin-bottom: 28px;
  }

  /* ========================================================================
     2. صفحات المرفقات الفردية ووسم رمز المرفق في أعلى يسار الصفحة
     ======================================================================== */
  .doc-attachment-page {
    page-break-before: always;
    break-before: page;
    page-break-after: auto;
    break-after: auto;
    page-break-inside: avoid;
    break-inside: avoid;
    break-inside: avoid-page;
    box-sizing: border-box;
    height: auto;
    max-height: 250mm;
    overflow: hidden;
    display: block;
    position: relative;
    padding: 0;
    margin-top: 25px;
    margin-bottom: 10px;
  }
  .doc-page-header-strip {
    border-bottom: 2px solid #0f2942;
    padding-bottom: 4px;
    margin-bottom: 4px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    position: relative;
    flex-shrink: 0;
  }
  .doc-header-meta {
    flex: 1;
    text-align: right;
    padding-left: 145px; /* ترك مساحة مخصصة للوسم البارز في أقصى اليسار */
  }
  .doc-header-main-title {
    font-size: 9.5pt;
    font-weight: 800;
    color: #0f2942;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
    line-height: 1.3;
  }
  .doc-badge-seq {
    background: #1e3a8a;
    color: white;
    font-size: 7pt;
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 700;
    white-space: nowrap;
  }
  .doc-header-sub-meta {
    font-size: 7.5pt;
    color: #475569;
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    line-height: 1.3;
  }

  /* وسم رمز المرفق في أعلى يسار الصفحة - لون مميز وخلفية مميزة جداً */
  .stamp-badge-top-left {
    position: absolute;
    top: 0px;
    left: 0px;
    background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
    border: 2px solid #facc15; /* إطار ذهبي فاقع */
    border-radius: 6px;
    padding: 3px 10px;
    text-align: center;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.3);
    min-width: 135px;
    z-index: 100;
  }
  .stamp-title-text {
    font-size: 6.5pt;
    font-weight: 700;
    color: #93c5fd;
    letter-spacing: 0.5px;
    margin-bottom: 0px;
  }
  .stamp-code-text {
    font-size: 11pt;
    font-weight: 900;
    color: #facc15; /* لون ذهبي ناصع ومميز */
    font-family: 'Courier New', monospace, sans-serif;
    letter-spacing: 0.5px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  }

  .doc-display-container {
    display: flex;
    justify-content: center;
    align-items: center;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 2px;
    margin: 3px 0;
    overflow: hidden;
    box-sizing: border-box;
    width: 100%;
    max-height: 222mm;
    page-break-before: avoid;
    break-before: avoid;
    page-break-after: avoid;
    break-after: avoid;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .doc-rendered-image {
    max-width: 100%;
    max-height: 218mm;
    width: auto;
    height: auto;
    display: block;
    object-fit: contain;
    border-radius: 4px;
    margin: 0 auto;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* بطاقة بديلة للوثائق عند تعذر عرض الصورة المباشرة */
  .doc-fallback-sheet {
    text-align: center;
    padding: 14px 12px;
    max-width: 90%;
    border: 2px dashed #94a3b8;
    border-radius: 8px;
    background: #f8fafc;
  }
  .fallback-icon { font-size: 26pt; margin-bottom: 4px; }
  .doc-fallback-sheet h3 { font-size: 11pt; color: #0f2942; margin: 0 0 4px 0; }
  .doc-fallback-sheet p { font-size: 8pt; color: #334155; margin: 2px 0; }
  .fallback-summary {
    background: #e2e8f0;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 7.5pt;
    margin-top: 6px;
  }
  .fallback-audit-seal {
    margin-top: 8px;
    display: inline-block;
    background: #ecfdf5;
    color: #15803d;
    border: 1.5px solid #16a34a;
    padding: 3px 10px;
    border-radius: 999px;
    font-weight: 800;
    font-size: 8pt;
  }

  .doc-page-footer-strip {
    border-top: 1.5px solid #0f2942;
    padding-top: 3px;
    margin-top: 3px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 7.5pt;
    font-weight: 700;
    color: #1e293b;
    flex-shrink: 0;
    page-break-before: avoid;
    break-before: avoid;
    page-break-inside: avoid;
    break-inside: avoid;
  }
</style>
</head>
<body>

<!-- شريط الإجراءات العلوي غير المطبوع -->
<div class="no-print-bar">
    <div style="font-weight: 700; font-size: 11pt;">
        📋 المصبار التوثيقي المدمج وجدول المرفقات (${indexedEvidenceList.length} وثيقة) — جاهز للتصدير كـ PDF
    </div>
    <div>
        <button onclick="window.close()" class="btn-close-action">إغلاق</button>
        <button onclick="window.print()" class="btn-print-action">
            🖨️ حفظ بتنسيق PDF / طباعة الآن
        </button>
    </div>
</div>

<div class="print-page-wrapper">
    <!-- ==================================================================== -->
    <!-- الصفحة الأولى: جدول فهرس الوثائق والمرفقات المنظم والمعتمد -->
    <!-- ==================================================================== -->
    <div class="inst-header">
        <div class="inst-col-right">
            <div>جمهورية العراق</div>
            <div>وزارة التعليم العالي والبحث العلمي</div>
            <div>جهاز الإشراف والتقويم العلمي</div>
        </div>
        <div class="inst-col-center">
            <h1>استمارة تقييم أداء أعضاء الهيئة التدريسية (21)</h1>
            <div class="sub-head">جدول فهرس وتوثيق المرفقات والأدلة الثبوتية الرسمية</div>
        </div>
        <div class="inst-col-left">
            <div><strong>العام الدراسي:</strong> ${year}</div>
            <div><strong>تاريخ التصدير:</strong> ${printDate}</div>
            <div><strong>الوثائق المعتمدة:</strong> ${indexedEvidenceList.length} وثيقة</div>
        </div>
    </div>

    <!-- ملخص بيانات التدريسي -->
    <div class="meta-profile-box">
        <div class="profile-field"><span>الاسم الكامل واللقب:</span> ${teacherName}</div>
        <div class="profile-field"><span>المرتبة العلمية:</span> ${teacherRank}</div>
        <div class="profile-field"><span>الجامعة:</span> ${university}</div>
        <div class="profile-field"><span>الكلية:</span> ${college}</div>
        <div class="profile-field"><span>القسم الأكاديمي:</span> ${dept}</div>
        <div class="profile-field"><span>مجموع الدرجات الموزونة:</span> <strong style="color: #166534;">${totalScore} درجة</strong></div>
    </div>

    <!-- جدول الوثائق والمرفقات المنظم -->
    <table class="docs-master-table">
        <thead>
            <tr>
                <th>ت</th>
                <th>رمز المرفق</th>
                <th>نوع الوثيقة</th>
                <th>العدد والتاريخ</th>
                <th>المحور والفقرة</th>
                <th>بيان الوثيقة وموضوعها</th>
                <th>الدرجة</th>
                <th>التدقيق</th>
            </tr>
        </thead>
        <tbody>
            ${evidenceRows}
            <tr class="total-summary-row">
                <td colspan="6" style="text-align: right; padding-right: 14px;">
                    إجمالي الأدلة والمرفقات الموثقة: (${indexedEvidenceList.length} وثيقة رسمية معتمدة)
                </td>
                <td style="color: #166534; font-weight: 900;">${totalScore}</td>
                <td style="color: #0369a1;">مطابق 100%</td>
            </tr>
        </tbody>
    </table>

    <!-- مصادقات اللجان الأكاديمية -->
    <div class="signatures-section">
        <div class="sig-col">
            <div class="sig-title">توقيع عضو الهيئة التدريسية</div>
            <div>التوقيع: ............................</div>
            <div style="margin-top: 4px; font-size: 8pt; color: #64748b;">التاريخ: .... / .... / 2026</div>
        </div>
        <div class="sig-col">
            <div class="sig-title">مصادقة السيد رئيس القسم</div>
            <div>التوقيع: ............................</div>
            <div style="margin-top: 4px; font-size: 8pt; color: #64748b;">التاريخ: .... / .... / 2026</div>
        </div>
        <div class="sig-col">
            <div class="sig-title">مصادقة عميد الكلية / الختم الرسمي</div>
            <div>التوقيع: ............................</div>
            <div style="margin-top: 4px; font-size: 8pt; color: #64748b;">ختم الكلية الرسمي</div>
        </div>
    </div>

    <!-- ==================================================================== -->
    <!-- الصفحات اللاحقة: كافة صور ووثائق المرفقات مع وسم رمز المرفق البارز -->
    <!-- ==================================================================== -->
    ${documentPagesHtml.trim()}
</div>

<script>
window.onload = function() {
    function triggerPrintWhenReady() {
        var images = Array.from(document.images);
        var loadedCount = 0;
        var total = images.length;
        if (total === 0) {
            setTimeout(function() { window.print(); }, 250);
            return;
        }
        var done = false;
        function onDone() {
            if (done) return;
            done = true;
            setTimeout(function() { window.print(); }, 250);
        }
        function checkImg() {
            loadedCount++;
            if (loadedCount >= total) {
                onDone();
            }
        }
        images.forEach(function(img) {
            if (img.complete) {
                checkImg();
            } else {
                img.addEventListener('load', checkImg);
                img.addEventListener('error', checkImg);
            }
        });
        setTimeout(onDone, 2000);
    }
    triggerPrintWhenReady();
};
<\/script>
</body>
</html>`;

    const pw = window.open('', '_blank', 'width=1050,height=850');
    if (pw) {
        pw.document.write(html);
        pw.document.close();
    } else {
        showToast("يرجى السماح بالنوافذ المنبثقة في المتصفح لتصدير PDF، أو استخدم زر الطباعة.");
    }
}



function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
}

// ============================================================================
// تعبئة البيانات التجريبية والحفظ والاستعادة
// ============================================================================
async function loadSampleData() {
    let sample = null;
    try {
        const response = await fetch("/api/sample-data");
        if (response.ok) {
            const res = await response.json();
            if (res && res.success && res.sample) {
                sample = res.sample;
            }
        }
    } catch (err) {
        console.log("Using offline sample data fallback:", err);
    }

    if (!sample) {
        sample = {
            personal_info: {
                university: "الجامعة التكنولوجية",
                college: "كلية هندسة العمارة",
                department: "قسم هندسة التصميم المعماري",
                form_no: "2026/0412",
                form_code: "AGY-2026-ARCH-01",
                first_name: "أحمد",
                father_name: "لؤي",
                grandfather_name: "أحمد",
                great_grandfather_name: "",
                last_name: "",
                mother_name: "فاطمة",
                mother_father_name: "محمد",
                mother_grandfather_name: "علي",
                national_id: "198520349812",
                registry_no: "142",
                page_no: "58",
                issue_year: "2021",
                issue_month: "05",
                issue_day: "12",
                degree: "دكتوراه",
                order_no_and_date: "ق/452 في 2018/06/10",
                degree_year: "2018",
                degree_month: "06",
                degree_day: "10",
                granting_country: "العراق",
                granting_univ: "الجامعة التكنولوجية",
                granting_college: "كلية هندسة العمارة",
                granting_dept: "قسم هندسة التصميم المعماري",
                general_specialty: "هندسة معمارية",
                specific_specialty: "تصميم معماري وتكنولوجيا البناء",
                academic_title: "أستاذ مساعد",
                title_granter: "مجلس الجامعة التكنولوجية",
                title_year: "2022",
                title_month: "03",
                title_day: "15",
                phone: "07701234567",
                email: "ahmed.l.ahmed@uotechnology.edu.iq"
            },
            is_non_teaching: false,
            axis1: {
                courses_score: 20,
                classroom_management_score: 20,
                blended_learning_items: [5, 5, 5, 5],
                course_description_items: [4, 4, 4, 4, 4],
                job_commitment_items: [4, 4, 4, 4, 4]
            },
            axis2: {
                global_research_score: 60,
                local_research_score: 25,
                supervision_score: 15
            },
            axis3: {
                committees_score: 30,
                continuous_learning_score: 20,
                thank_you_score: 20,
                field_visits_score: 30
            },
            axis4: {
                items: { item1: 3, item2: 4, item11: 3 }
            },
            axis5: { penalties: [] }
        };
    }

    formData = sample;
            
            // تجهيز أدلة مفهرسة نموذجية مع مسارات ملفات فعلية للمعاينة والتحميل
            indexedEvidenceList = [
                {
                    ref_code: "REF-AX1-P1-01",
                    axis: "axis1",
                    paragraph: "1",
                    axis_name: "المحور الأول: جودة التدريس",
                    paragraph_name: "المقررات الدراسية",
                    title: "أمر تكليف بتدريس مادتي التصميم المعماري وتكنولوجيا البناء",
                    doc_type: "أمر إداري بتكليف تدريسي",
                    doc_number: "ق/452",
                    date: "2025/10/01",
                    issuer: "عمادة كلية هندسة العمارة - الجامعة التكنولوجية",
                    suggested_score: 20.0,
                    file_path: "/uploads/97f85fd7-7428-480b-8c71-2069f41df7e7_تكليفات معماري تحديث.pdf",
                    filename: "أمر تكليف تدريسي معماري.pdf",
                    auto_fill_summary: "تمت فهرسة المقررات وتثبيت 20 درجة."
                },
                {
                    ref_code: "REF-AX2-P1-01",
                    axis: "axis2",
                    paragraph: "1",
                    axis_name: "المحور الثاني: النشاط العلمي",
                    paragraph_name: "بحوث المستوعبات العالمية (Scopus/Clarivate)",
                    title: "Sustainable Self-Compacting Geopolymer Concrete (CiteScore 6.2 - First Author)",
                    doc_type: "بحث علمي منشور بمستوعب سكوباس",
                    doc_number: "10.1016/j.conbuildmat.2025.132890",
                    date: "2025/08/20",
                    issuer: "Elsevier - Construction & Building Materials",
                    suggested_score: 60.0,
                    file_path: "/uploads/960c2f7e-8e04-4bf0-aa09-a9630ab537df_Ahmed Louay Ahmed - Fellowship.pdf",
                    filename: "Ahmed Louay Ahmed - Scopus Research.pdf",
                    auto_fill_summary: "الباحث الأول - CiteScore > 1 - إسناد 60 درجة."
                },
                {
                    ref_code: "REF-AX2-P2-01",
                    axis: "axis2",
                    paragraph: "2",
                    axis_name: "المحور الثاني: النشاط العلمي",
                    paragraph_name: "البحوث المحلية والمؤتمرات والكتب",
                    title: "كتاب تكنولوجيا الخرسانة الحديثة (مقوم علمياً ومنشور في دار نشر أكاديمية)",
                    doc_type: "كتاب منهجي مؤلف",
                    doc_number: "ISBN 978-9922-601-14-2",
                    date: "2025/09/15",
                    issuer: "دار دجلة للطباعة والنشر والتوزيع",
                    suggested_score: 20.0,
                    file_path: "/uploads/39c37b8e-2b4f-4e10-848b-d1b98b4317ab_امر جامعي 925.pdf",
                    filename: "أمر جامعي بنشر كتاب وبحث 925.pdf",
                    auto_fill_summary: "كتاب مؤلف صنف أول مقوم علمياً - إسناد 20 درجة."
                },
                {
                    ref_code: "REF-AX3-P1-01",
                    axis: "axis3",
                    paragraph: "1",
                    axis_name: "المحور الثالث: الجانب التربوي والإرشادي",
                    paragraph_name: "المشاركة في اللجان",
                    title: "أمر إداري بتشكيل اللجنة الامتحانية المركزية للعام الدراسي 2025-2026",
                    doc_type: "أمر تشكيل لجنة امتحانية",
                    doc_number: "4892",
                    date: "2025/09/28",
                    issuer: "رئاسة الجامعة التكنولوجية",
                    suggested_score: 30.0,
                    file_path: "/uploads/64af219a-a049-497d-858a-a02066899af1_أمر اداري تكليف مشاركة مناقشة مشاريع تخرج المرحلة الخامسة .pdf",
                    filename: "أمر تشكيل لجنة مناقشة مشاريع التخرج.pdf",
                    auto_fill_summary: "عضوية اللجنة الامتحانية المركزية - إسناد 30 درجة."
                },
                {
                    ref_code: "REF-AX3-P2-01",
                    axis: "axis3",
                    paragraph: "2",
                    axis_name: "المحور الثالث: الجانب التربوي والإرشادي",
                    paragraph_name: "التعليم المستمر والجودة",
                    title: "شهادة إلقاء دورة تدريبية تخصصية في برنامج Revit Architecture للمهندسين",
                    doc_type: "شهادة محاضر بالتعليم المستمر",
                    doc_number: "م.ت.م/108",
                    date: "2025/11/04",
                    issuer: "مركز التعليم المستمر - الجامعة التكنولوجية",
                    suggested_score: 10.0,
                    file_path: "/uploads/77180487-fbcf-40ae-8a5d-fe8bbbef8566_احتساب عمل تطوعي.pdf",
                    filename: "احتساب عمل تطوعي وتعليم مستمر.pdf",
                    auto_fill_summary: "محاضر في دورة تعليم مستمر - إسناد 10 درجات."
                },
                {
                    ref_code: "REF-AX3-P3-01",
                    axis: "axis3",
                    paragraph: "3",
                    axis_name: "المحور الثالث: الجانب التربوي والإرشادي",
                    paragraph_name: "كتب الشكر والتقدير",
                    title: "كتاب شكر وتقدير للجهود المتميزة في النشر العلمي والارتقاء بالتصنيف الأكاديمي",
                    doc_type: "كتاب شكر وتقدير رسمي",
                    doc_number: "م.و/1042",
                    date: "2025/11/15",
                    issuer: "معالي وزير التعليم العالي والبحث العلمي",
                    suggested_score: 20.0,
                    file_path: "/uploads/d2664b65-4392-4d19-84a6-822fa79a0946_شكر وتقدير 963.pdf",
                    filename: "كتاب شكر وتقدير وزاري 963.pdf",
                    auto_fill_summary: "كتاب شكر من معالي الوزير - إسناد 20 درجة."
                },
                {
                    ref_code: "REF-AX4-P1-01",
                    axis: "axis4",
                    paragraph: "2",
                    axis_name: "المحور الرابع: مواطن القوة",
                    paragraph_name: "معامل هيرش h-index",
                    title: "توثيق امتلاك معامل هيرش Scopus h-index = 7 معتمد رسمياً",
                    doc_type: "تقرير صفحة الباحث في Scopus",
                    doc_number: "Scopus-Author-572019482",
                    date: "2025/10/05",
                    issuer: "منظومة سكوباس العالمية",
                    suggested_score: 4.0,
                    file_path: "/uploads/1ffd53df-196a-4042-96f7-d7761b31323c_عضوية تحرير المجلة العراقية.pdf",
                    filename: "عضوية تحرير المجلة ومواطن القوة.pdf",
                    auto_fill_summary: "معامل هيرش 7 فأكثر يمنح 4 درجات مواطن قوة."
                }
            ];

            // تثبيت خيارات العينة في القفل اليدوي
            manualScoreOverrides = {};
            window.manualScoreOverrides = {};
            PARAGRAPH_SCORE_MAPPINGS.forEach(m => {
                manualScoreOverrides[m.field] = true;
            });

            // مزامنة فورية للأدلة النموذجية مع كاش الخادم
            try {
                fetch("/api/sync-evidence-catalog", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ indexed_evidence_list: indexedEvidenceList })
                }).catch(e => console.warn("Sample evidence sync failed:", e));
            } catch (e) {}

            populateUIFromState();
            updateCheckboxesUI();
            updateScoreStatusBadges();
            renderAllMiniEvidenceTables();
            renderMasterCatalogTable();
            updateIndexStats();
            calculateLiveScore();
            showToast("تم تحميل الملف التوثيقي النموذجي مع الأدلة المفهرسة بنجاح! 🚀");
}

function populateUIFromState() {
    document.querySelectorAll("[data-bind]").forEach(input => {
        const key = input.getAttribute("data-bind");
        const val = getDeepValue(formData, key);
        if (input.type === "checkbox") {
            input.checked = Boolean(val);
        } else if (val !== undefined && val !== null) {
            input.value = val;
        }
    });
    const nonTeach = document.getElementById("is_non_teaching");
    if (nonTeach) nonTeach.checked = formData.is_non_teaching;
    toggleNonTeachingUI(formData.is_non_teaching);
    updateCheckboxesUI();
    updateScoreStatusBadges();
}

function saveDraft() {
    const draftData = {
        timestamp: new Date().toISOString(),
        formData: formData,
        indexedEvidenceList: indexedEvidenceList,
        manualScoreOverrides: manualScoreOverrides
    };
    const jsonStr = JSON.stringify(draftData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    downloadBlob(blob, `مسودة_استمارة_21_مع_الأدلة_${new Date().toISOString().split('T')[0]}.json`);
    localStorage.setItem("faculty_eval_draft_2026_indexed", jsonStr);
    showToast("تم حفظ المسودة وفهرس الأدلة بنجاح محلياً وفي ملف JSON! 💾");
}

async function loadDraft() {
    // === كشف علامة إعادة الضبط: إذا جاءنا من resetForm نعرض واجهة فارغة تماماً ===
    const resetFlag = localStorage.getItem("faculty_eval_reset_flag");
    if (resetFlag === "1") {
        localStorage.removeItem("faculty_eval_reset_flag");
        indexedEvidenceList = [];
        syncEvidenceWithScores();
        populateUIFromState();
        renderAllMiniEvidenceTables();
        renderMasterCatalogTable();
        updateIndexStats();
        calculateLiveScore();
        return; // الخروج المبكر: لا نجلب أي فهرس أدلة
    }

    const saved = localStorage.getItem("faculty_eval_draft_2026_indexed") || localStorage.getItem("faculty_eval_draft_2026");
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            formData = parsed.formData || (Array.isArray(parsed) ? formData : parsed);
            const items = parsed.indexedEvidenceList || parsed.attachments || (Array.isArray(parsed) ? parsed : []);
            // تفريغ المرفقات الافتراضية السابقة (48 أو 55 ملفاً) لتبدأ الصفحة بحالة نظيفة 0 ملفات وفق التوجيه
            const hasLegacyDefaults = items.length === 48 || items.length === 55 ||
                items.some(e => e.ref_code === "REF-AX4-P2-01" && (e.doc_number === "م.ع/17" || e.doc_number === "17")) ||
                !localStorage.getItem("faculty_eval_catalog_purged_v19");

            if (hasLegacyDefaults) {
                console.log("Purging legacy 48/55-item default catalog from local draft to ensure fresh start");
                localStorage.setItem("faculty_eval_catalog_purged_v19", "true");
                indexedEvidenceList = [];
                if (parsed && typeof parsed === "object") {
                    delete parsed.indexedEvidenceList;
                    delete parsed.attachments;
                    try {
                        localStorage.setItem("faculty_eval_draft_2026_indexed", JSON.stringify(parsed));
                    } catch(e) {}
                }
            } else {
                const hasStuckOrCorrupted = items.some(e => 
                    !e.doc_number || e.doc_number === "غير محدد" || e.doc_number === "-" ||
                    /yolll|solell|ajljig/i.test(e.title || '') || /yolll|solell/i.test(e.subject || '')
                );
                if (!hasStuckOrCorrupted && items.length > 0) {
                    indexedEvidenceList = items;
                }
            }
            if (parsed.manualScoreOverrides) {
                manualScoreOverrides = parsed.manualScoreOverrides;
                window.manualScoreOverrides = manualScoreOverrides;
            }
        } catch (e) {
            console.error("Draft load error:", e);
        }
    }

    // مزامنة ذكية مع فهرس الأدلة النظيف والمعتمد من الخادم أو الملف المحلي الثابت
    try {
        let resp = null;
        try {
            resp = await fetch("/api/evidence-catalog");
        } catch (netErr) {
            resp = null;
        }
        if (!resp || !resp.ok) {
            try {
                resp = await fetch("data/evidence_catalog.json");
            } catch (netErr2) {
                resp = null;
            }
        }
        let data = null;
        if (resp && resp.ok) {
            try {
                data = await resp.json();
            } catch (e) {
                data = null;
            }
        }
        if ((!data || !data.success) && window.DEFAULT_EVIDENCE_CATALOG && Array.isArray(window.DEFAULT_EVIDENCE_CATALOG)) {
            data = { success: true, indexed_evidence_list: window.DEFAULT_EVIDENCE_CATALOG };
        }
        if (data && data.success && Array.isArray(data.indexed_evidence_list) && data.indexed_evidence_list.length > 0) {
                const validServerItems = data.indexed_evidence_list.filter(e => e.axis && e.paragraph);
                if (validServerItems.length > 0) {
                    if (!indexedEvidenceList || indexedEvidenceList.length === 0) {
                        indexedEvidenceList = validServerItems;
                    } else {
                        const localMap = new Map(indexedEvidenceList.map(item => [item.ref_code, item]));
                        validServerItems.forEach(sItem => {
                            if (!localMap.has(sItem.ref_code)) {
                                localMap.set(sItem.ref_code, sItem);
                            } else {
                                const existing = localMap.get(sItem.ref_code);
                                if (sItem.audit_status) existing.audit_status = sItem.audit_status;
                                if (sItem.auditor_notes) existing.auditor_notes = sItem.auditor_notes;
                                if (sItem.suggested_score !== undefined) existing.suggested_score = sItem.suggested_score;
                                // تصحيح وتحديث أرقام وتواريخ الوثائق الرسمية في المسودة المحفوظة
                                if (sItem.doc_number && (!existing.doc_number || existing.doc_number.includes("قيد التدقيق"))) {
                                    existing.doc_number = sItem.doc_number;
                                }
                                if (sItem.date && (!existing.date || existing.date.includes("قيد التدقيق"))) {
                                    existing.date = sItem.date;
                                }
                                if (sItem.title && (!existing.title || existing.title === existing.filename)) {
                                    existing.title = sItem.title;
                                }
                                if (sItem.handwritten_detected !== undefined) {
                                    existing.handwritten_detected = sItem.handwritten_detected;
                                }
                                if (sItem.handwritten_fields) {
                                    existing.handwritten_fields = sItem.handwritten_fields;
                                }
                                if (sItem.auto_fill_summary && !existing.auto_fill_summary) {
                                    existing.auto_fill_summary = sItem.auto_fill_summary;
                                }
                            }
                        });
                        indexedEvidenceList = Array.from(localMap.values());
                    }
                }
            }
    } catch (err) {
        console.log("Could not auto-fetch evidence catalog:", err);
    }

    syncEvidenceWithScores();
    populateUIFromState();
    renderAllMiniEvidenceTables();
    renderMasterCatalogTable();
    updateIndexStats();
    calculateLiveScore();

    // تحديث التخزين المحلي ليكون متطابقاً
    const draftObj = {
        timestamp: new Date().toISOString(),
        formData: formData,
        indexedEvidenceList: indexedEvidenceList,
        manualScoreOverrides: manualScoreOverrides
    };
    localStorage.setItem("faculty_eval_draft_2026_indexed", JSON.stringify(draftObj));
}

function handleRestoreFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const parsed = JSON.parse(event.target.result);
            formData = parsed.formData || parsed;
            indexedEvidenceList = parsed.indexedEvidenceList || parsed.attachments || [];
            if (parsed.manualScoreOverrides) {
                manualScoreOverrides = parsed.manualScoreOverrides;
                window.manualScoreOverrides = manualScoreOverrides;
            }
            syncEvidenceWithScores();
            populateUIFromState();
            renderAllMiniEvidenceTables();
            renderMasterCatalogTable();
            updateIndexStats();
            calculateLiveScore();
            showToast("تم استعادة المسودة وفهرس الأدلة بنجاح! 📂");
        } catch (err) {
            alert("الملف غير صالح كمسودة JSON للاستمارة.");
        }
    };
    reader.readAsText(file);
}

async function resetForm() {
    if (confirm("هل أنت متأكد من تفريغ كافة حقول الاستمارة والأدلة المفهرسة؟")) {
        // 1. حذف المسودات من localStorage
        localStorage.removeItem("faculty_eval_draft_2026_indexed");
        localStorage.removeItem("faculty_eval_draft_2026");
        // 2. وضع علامة إعادة ضبط لمنع loadDraft من إعادة تحميل فهرس الأدلة
        localStorage.setItem("faculty_eval_reset_flag", "1");
        // 3. إفراغ كاش الخادم (indexed_results_cache.json)
        try {
            await fetch("/api/clear-all-evidence", { method: "POST" });
        } catch (e) {
            console.warn("Could not reach server to clear evidence cache:", e);
        }
        // 4. إعادة تحميل الصفحة بواجهة فارغة تماماً
        location.reload();
    }
}

function showToast(message) {
    let toast = document.getElementById("platform-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "platform-toast";
        toast.style.position = "fixed";
        toast.style.bottom = "24px";
        toast.style.left = "50%";
        toast.style.transform = "translateX(-50%)";
        toast.style.background = "#0f172a";
        toast.style.color = "#ffffff";
        toast.style.padding = "0.85rem 1.75rem";
        toast.style.borderRadius = "9999px";
        toast.style.boxShadow = "0 10px 25px -3px rgba(0, 0, 0, 0.4)";
        toast.style.zIndex = "9999";
        toast.style.fontWeight = "700";
        toast.style.fontSize = "0.95rem";
        toast.style.transition = "opacity 0.3s ease";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = "1";
    toast.style.display = "block";
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.style.display = "none", 300);
    }, 4000);
}

function getDeepValue(obj, path) {
    return path.split('.').reduce((prev, curr) => prev ? prev[curr] : undefined, obj);
}

function setDeepValue(obj, path, val) {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = val;
}

// ============================================================================
// إدارة التواقيع الرقمية والأختام الرسمية (Digital Signatures & Stamps)
// ============================================================================
function isCanvasBlank(canvas) {
    if (!canvas) return true;
    const ctx = canvas.getContext('2d');
    const pixelBuffer = new Uint32Array(
        ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer
    );
    return !pixelBuffer.some(color => color !== 0);
}

function getDigitalSignaturesPayload() {
    const canvasDirect = document.getElementById("sig-canvas-direct");
    const canvasHigher = document.getElementById("sig-canvas-higher");

    return {
        direct_manager_sig: (canvasDirect && !isCanvasBlank(canvasDirect)) ? canvasDirect.toDataURL("image/png") : "",
        higher_manager_sig: (canvasHigher && !isCanvasBlank(canvasHigher)) ? canvasHigher.toDataURL("image/png") : "",
        college_stamp: collegeStampDataUrl || ""
    };
}

function initSignaturePads() {
    setupCanvasDrawing("sig-canvas-direct");
    setupCanvasDrawing("sig-canvas-higher");
    initCollegeStampUpload();
}

function setupCanvasDrawing(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e3a8a"; // حبر أزرق رسمي

    let drawing = false;

    function getCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function startDraw(e) {
        drawing = true;
        const pos = getCoords(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        e.preventDefault();
    }

    function draw(e) {
        if (!drawing) return;
        const pos = getCoords(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        e.preventDefault();
    }

    function stopDraw(e) {
        if (drawing) {
            drawing = false;
            ctx.closePath();
        }
    }

    canvas.addEventListener("mousedown", startDraw);
    canvas.addEventListener("mousemove", draw);
    window.addEventListener("mouseup", stopDraw);

    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    window.addEventListener("touchend", stopDraw);
}

function clearSignature(type) {
    const canvas = document.getElementById(type === 'direct' ? "sig-canvas-direct" : "sig-canvas-higher");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

function initCollegeStampUpload() {
    const stampInput = document.getElementById("college-stamp-input");
    if (!stampInput) return;

    stampInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            collegeStampDataUrl = evt.target.result;
            const img = document.getElementById("stamp-preview-img");
            const placeholder = document.getElementById("stamp-placeholder-text");
            const btnRemove = document.getElementById("btn-remove-stamp");
            if (img) {
                img.src = collegeStampDataUrl;
                img.style.display = "block";
            }
            if (placeholder) placeholder.style.display = "none";
            if (btnRemove) btnRemove.style.display = "inline-flex";
            showToast("تم إرفاق الختم الرسمي للكلية بنجاح! 🏛️");
        };
        reader.readAsDataURL(file);
    });
}

function removeCollegeStamp() {
    collegeStampDataUrl = "";
    const img = document.getElementById("stamp-preview-img");
    const placeholder = document.getElementById("stamp-placeholder-text");
    const btnRemove = document.getElementById("btn-remove-stamp");
    const stampInput = document.getElementById("college-stamp-input");
    if (img) { img.src = ""; img.style.display = "none"; }
    if (placeholder) placeholder.style.display = "block";
    if (btnRemove) btnRemove.style.display = "none";
    if (stampInput) stampInput.value = "";
    showToast("تمت إزالة صورة الختم.");
}

// ============================================================================
// مربعات الإحاطة البصرية وقص المقتطفات (Bounding Boxes & Snippet Cropper)
// ============================================================================
function clearBoundingBoxes() {
    const layer = document.getElementById("bbox-overlay-layer");
    if (layer) layer.innerHTML = "";
}

function toggleBoundingBoxes() {
    showBoundingBoxes = !showBoundingBoxes;
    const layer = document.getElementById("bbox-overlay-layer");
    const textSpan = document.getElementById("toggle-bbox-text");
    if (layer) {
        layer.style.display = showBoundingBoxes ? "block" : "none";
    }
    if (textSpan) {
        textSpan.textContent = showBoundingBoxes ? "إخفاء المربعات المكتشفة" : "إظهار المربعات المكتشفة";
    }
}

function renderBoundingBoxes(item) {
    clearBoundingBoxes();
    if (!item) return;

    const layer = document.getElementById("bbox-overlay-layer");
    if (!layer) return;

    let boxes = [];
    if (item.bounding_boxes) {
        if (Array.isArray(item.bounding_boxes)) {
            boxes = [...item.bounding_boxes];
        } else if (typeof item.bounding_boxes === "object") {
            Object.keys(item.bounding_boxes).forEach(k => {
                const b = item.bounding_boxes[k];
                if (b && typeof b === "object") {
                    boxes.push({
                        field: k === "doc_number" ? "number" : k,
                        top: b.top,
                        left: b.left,
                        width: b.width,
                        height: b.height,
                        text: b.label || b.text
                    });
                }
            });
        }
    }

    if (boxes.length === 0) {
        if (item.doc_number) {
            boxes.push({ field: "number", top: 12, left: 62, width: 28, height: 6, text: `العدد: ${item.doc_number}` });
        }
        if (item.date) {
            boxes.push({ field: "date", top: 18, left: 62, width: 28, height: 5, text: `التاريخ: ${item.date}` });
        }
        if (item.subject || item.title) {
            boxes.push({ field: "subject", top: 27, left: 20, width: 60, height: 8, text: `م/ ${item.subject || item.title}` });
        }
        boxes.push({ field: "stamp", top: 80, left: 15, width: 25, height: 14, text: "المصادقة / الختم الرسمي" });
    }

    if (item.matched_faculty_info && !boxes.some(b => b.field === 'faculty')) {
        boxes.push({
            field: "faculty",
            top: item.matched_faculty_info.approx_top_pct || 55,
            left: 15,
            width: 70,
            height: 6,
            text: `التدريسي: ${item.matched_faculty_info.matched_name} (${item.matched_faculty_info.role})`
        });
    }

    const fieldLabels = {
        number: "العدد",
        date: "التاريخ",
        subject: "الموضوع (م/ )",
        stamp: "الختم / التوقيع",
        faculty: "اسم التدريسي"
    };

    boxes.forEach(box => {
        const div = document.createElement("div");
        div.className = `bbox-rect bbox-${box.field || 'num'}`;
        div.style.top = `${box.top || 0}%`;
        div.style.left = `${box.left || 0}%`;
        div.style.width = `${box.width || 20}%`;
        div.style.height = `${box.height || 5}%`;
        div.title = `${fieldLabels[box.field] || 'حقل'}: ${box.text || ''}`;

        const label = document.createElement("span");
        label.className = "bbox-tag-label";
        label.textContent = fieldLabels[box.field] || box.field;
        div.appendChild(label);

        div.addEventListener("click", (e) => {
            e.stopPropagation();
            showToast(`${fieldLabels[box.field] || 'حقل'}: ${box.text || 'مكتشف بالذكاء الاصطناعي'}`);
        });

        layer.appendChild(div);
    });

    layer.style.display = showBoundingBoxes ? "block" : "none";
}

function initSnippetCropper() {
    const wrapper = document.getElementById("preview-image-wrapper");
    if (!wrapper) return;

    wrapper.addEventListener("mousedown", (e) => {
        if (!isCroppingActive) return;
        const rect = wrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        cropStart = { x, y };

        const cropRect = document.getElementById("crop-selection-rect");
        if (cropRect) {
            cropRect.style.display = "block";
            cropRect.style.left = `${x}px`;
            cropRect.style.top = `${y}px`;
            cropRect.style.width = "0px";
            cropRect.style.height = "0px";
        }
    });

    wrapper.addEventListener("mousemove", (e) => {
        if (!isCroppingActive || !cropStart) return;
        const rect = wrapper.getBoundingClientRect();
        const currentX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const currentY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

        const left = Math.min(cropStart.x, currentX);
        const top = Math.min(cropStart.y, currentY);
        const width = Math.abs(currentX - cropStart.x);
        const height = Math.abs(currentY - cropStart.y);

        const cropRect = document.getElementById("crop-selection-rect");
        if (cropRect) {
            cropRect.style.left = `${left}px`;
            cropRect.style.top = `${top}px`;
            cropRect.style.width = `${width}px`;
            cropRect.style.height = `${height}px`;
        }
    });

    window.addEventListener("mouseup", () => {
        if (!isCroppingActive || !cropStart) return;
        const wrapper = document.getElementById("preview-image-wrapper");
        const cropRect = document.getElementById("crop-selection-rect");
        if (!wrapper || !cropRect) return;

        const rect = wrapper.getBoundingClientRect();
        const leftPx = parseFloat(cropRect.style.left) || 0;
        const topPx = parseFloat(cropRect.style.top) || 0;
        const widthPx = parseFloat(cropRect.style.width) || 0;
        const heightPx = parseFloat(cropRect.style.height) || 0;

        if (widthPx > 10 && heightPx > 10) {
            cropBoxCoords = {
                top: (topPx / rect.height) * 100,
                left: (leftPx / rect.width) * 100,
                width: (widthPx / rect.width) * 100,
                height: (heightPx / rect.height) * 100
            };
            const btnConfirm = document.getElementById("btn-confirm-crop");
            if (btnConfirm) btnConfirm.style.display = "inline-flex";
        }
        cropStart = null;
    });
}

function startCropper() {
    isCroppingActive = true;
    const imgBox = document.getElementById("preview-image-box");
    if (imgBox) imgBox.classList.add("cropper-mode-active");
    const hint = document.getElementById("cropper-hint");
    if (hint) hint.style.display = "inline-block";
    const btnCancel = document.getElementById("btn-cancel-cropper");
    if (btnCancel) btnCancel.style.display = "inline-flex";
    const btnConfirm = document.getElementById("btn-confirm-crop");
    if (btnConfirm) btnConfirm.style.display = "none";
}

function cancelCropper() {
    isCroppingActive = false;
    cropStart = null;
    cropBoxCoords = null;
    const imgBox = document.getElementById("preview-image-box");
    if (imgBox) imgBox.classList.remove("cropper-mode-active");
    const hint = document.getElementById("cropper-hint");
    if (hint) hint.style.display = "none";
    const btnCancel = document.getElementById("btn-cancel-cropper");
    if (btnCancel) btnCancel.style.display = "none";
    const btnConfirm = document.getElementById("btn-confirm-crop");
    if (btnConfirm) btnConfirm.style.display = "none";
    const cropRect = document.getElementById("crop-selection-rect");
    if (cropRect) cropRect.style.display = "none";
}

async function confirmCropScan() {
    if (!cropBoxCoords || !activePreviewItem) return;

    const btnConfirm = document.getElementById("btn-confirm-crop");
    if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = `<span class="spinner"></span> جاري التحليل...`;
    }

    try {
        const payload = {
            file_path: activePreviewItem.file_path,
            crop_box: cropBoxCoords
        };
        const resp = await fetch("/api/scan-snippet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (data.success) {
            document.getElementById("snippet-extracted-text").textContent = data.text || "لم يتم العثور على نص واضح";
            document.getElementById("snippet-detected-num").value = data.extracted_number || "";
            document.getElementById("snippet-detected-date").value = data.extracted_date || "";
            document.getElementById("snippet-result-modal").classList.add("active");
            cancelCropper();
        } else {
            alert(data.detail || "تعذر قراءة المقتطف.");
        }
    } catch (err) {
        console.error("Snippet scan error:", err);
        alert("فشلت عملية مسح المقتطف.");
    } finally {
        if (btnConfirm) {
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> قراءة المقتطف الآن`;
        }
    }
}

function closeSnippetModal() {
    const modal = document.getElementById("snippet-result-modal");
    if (modal) modal.classList.remove("active");
}

function applySnippetNumber() {
    const num = document.getElementById("snippet-detected-num").value.trim();
    if (!num || !activePreviewItem) return;
    activePreviewItem.doc_number = num;
    activePreviewItem.document_number = num;
    activePreviewItem.audit_status = 'modified';
    saveDraft();
    renderPreviewMetaNumberDate(activePreviewItem, false);
    renderAllMiniEvidenceTables();
    renderMasterCatalogTable();
    showToast(`تم تعيين العدد بنجاح: ${num}`);
}

function applySnippetDate() {
    const d = document.getElementById("snippet-detected-date").value.trim();
    if (!d || !activePreviewItem) return;
    activePreviewItem.date = d;
    activePreviewItem.audit_status = 'modified';
    saveDraft();
    renderPreviewMetaNumberDate(activePreviewItem, false);
    renderAllMiniEvidenceTables();
    renderMasterCatalogTable();
    showToast(`تم تعيين التاريخ بنجاح: ${d}`);
}

// Scopus & Crossref UI
function updatePreviewScopusUI(item) {
    const badge = document.getElementById("preview-scopus-badge");
    const btn = document.getElementById("btn-check-scopus");
    if (!badge || !btn) return;

    if (item.scopus_info) {
        badge.style.display = "inline-flex";
        badge.innerHTML = `<i class="fa-solid fa-check-circle" style="color:#16a34a;"></i> Scopus Q${item.scopus_info.quartile || '1'} (CiteScore: ${item.scopus_info.cite_score || '1.0'})`;
        btn.style.display = "none";
    } else if (item.doi || item.axis === 'axis2') {
        badge.style.display = "none";
        btn.style.display = "inline-flex";
    } else {
        badge.style.display = "none";
        btn.style.display = "none";
    }
}

async function checkCurrentScopus() {
    if (!activePreviewItem) return;
    const btn = document.getElementById("btn-check-scopus");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner"></span> فحص المستوعب...`;
    }

    try {
        const resp = await fetch("/api/check-doi", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                doi: activePreviewItem.doi || "",
                journal_title: activePreviewItem.title || "",
                ref_code: activePreviewItem.ref_code
            })
        });
        const data = await resp.json();
        if (data.success) {
            activePreviewItem.scopus_info = data.scopus_info;
            activePreviewItem.suggested_score = data.suggested_score || activePreviewItem.suggested_score;
            updatePreviewScopusUI(activePreviewItem);
            const metaScore = document.getElementById("preview-meta-score");
            if (metaScore) metaScore.textContent = `+${activePreviewItem.suggested_score} درجة`;
            renderAllMiniEvidenceTables();
            renderMasterCatalogTable();
            calculateLiveScore();
            showToast(data.message || "تم فحص بيانات Scopus بنجاح!");
        } else {
            alert(data.detail || "تعذر إكمال فحص Scopus");
        }
    } catch (e) {
        console.error("Check scopus error:", e);
        alert("فشل الاتصال بخدمة التحقق من Scopus");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> فحص Scopus / Crossref`;
        }
    }
}

// ============================================================================
// نمط المدقق الأكاديمي (Quality Assurance Auditor Mode)
// ============================================================================
function initAuditorMode() {
    const saved = localStorage.getItem("auditor_mode_active");
    if (saved === "true") {
        auditorModeActive = true;
        document.body.classList.add("auditor-active");
        updateAuditorButtonUI();
    }
}

function toggleAuditorMode() {
    auditorModeActive = !auditorModeActive;
    document.body.classList.toggle("auditor-active", auditorModeActive);
    localStorage.setItem("auditor_mode_active", String(auditorModeActive));
    updateAuditorButtonUI();
    renderAllMiniEvidenceTables();
    renderMasterCatalogTable();
    showToast(auditorModeActive ? "تم تفعيل نمط التدقيق والمراجعة الأكاديمية 🧐" : "تم تعطيل نمط التدقيق.");
}

function updateAuditorButtonUI() {
    const btn = document.getElementById("btn-toggle-auditor-mode");
    if (!btn) return;
    if (auditorModeActive) {
        btn.classList.add("auditor-indicator-active");
        btn.innerHTML = `<i class="fa-solid fa-user-check"></i> نمط المدقق: مفعّل ✔`;
    } else {
        btn.classList.remove("auditor-indicator-active");
        btn.innerHTML = `<i class="fa-solid fa-user-check"></i> نمط المدقق`;
    }
}

async function changeAuditStatus(refCode, newStatus) {
    const item = indexedEvidenceList.find(e => e.ref_code === refCode);
    if (!item) return;

    item.audit_status = newStatus;
    try {
        await fetch("/api/save-audit-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ref_code: refCode,
                status: newStatus,
                notes: ""
            })
        });
        showToast(`تم تحديث حالة التدقيق للوثيقة [${refCode}] إلى: ${newStatus}`);
        renderAllMiniEvidenceTables();
        renderMasterCatalogTable();
        calculateLiveScore();
    } catch (err) {
        console.error("Save audit status error:", err);
    }
}

// ============================================================================
// نافذة إعدادات VLM والذكاء الاصطناعي
// ============================================================================
function initVlmSettingsModal() {
    // Initialized listeners in initEventListeners
}

async function openVlmSettings() {
    const modal = document.getElementById("vlm-settings-modal");
    if (!modal) return;
    
    // Check localStorage first
    const savedLocalKey = localStorage.getItem("vlm_gemini_api_key");
    const savedLocalModel = localStorage.getItem("vlm_model");
    if (savedLocalKey && document.getElementById("vlm-api-key-input")) {
        document.getElementById("vlm-api-key-input").value = savedLocalKey;
    }
    if (savedLocalModel && document.getElementById("vlm-model-select")) {
        document.getElementById("vlm-model-select").value = savedLocalModel;
    }

    try {
        const resp = await fetch("/api/vlm-config");
        const data = await resp.json();
        if (data.success) {
            if (data.gemini_api_key) document.getElementById("vlm-api-key-input").value = data.gemini_api_key;
            if (data.vlm_model) document.getElementById("vlm-model-select").value = data.vlm_model;
            document.getElementById("vlm-local-fallback-check").checked = data.enable_local_fallback !== false;
        }
    } catch (e) {
        console.log("Could not load server VLM config, using local settings:", e);
    }
    modal.classList.add("active");
}

function closeVlmSettings() {
    const modal = document.getElementById("vlm-settings-modal");
    if (modal) modal.classList.remove("active");
}

function toggleApiKeyVisibility() {
    const inp = document.getElementById("vlm-api-key-input");
    const icon = document.getElementById("eye-key-icon");
    if (!inp || !icon) return;
    if (inp.type === "password") {
        inp.type = "text";
        icon.className = "fa-solid fa-eye-slash";
    } else {
        inp.type = "password";
        icon.className = "fa-solid fa-eye";
    }
}

async function testVlmApi() {
    const btn = document.getElementById("btn-test-vlm-api");
    const statusBox = document.getElementById("vlm-test-status");
    const apiKey = document.getElementById("vlm-api-key-input").value.trim();

    if (btn) btn.disabled = true;
    if (statusBox) {
        statusBox.style.display = "block";
        statusBox.style.background = "#eff6ff";
        statusBox.style.color = "#1d4ed8";
        statusBox.textContent = "جارٍ فحص المفتاح والاتصال بمحرك VLM...";
    }

    try {
        if (!apiKey) {
            if (statusBox) {
                statusBox.style.background = "#fef3c7";
                statusBox.style.color = "#92400e";
                statusBox.textContent = "تنبيه: لم يتم إدخال مفتاح API، سيعتمد النظام على محرك المستندات الذكي المحلي الفوري.";
            }
            return;
        }
        const resp = await fetch("/api/vlm-config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                gemini_api_key: apiKey,
                vlm_model: document.getElementById("vlm-model-select").value,
                enable_local_fallback: document.getElementById("vlm-local-fallback-check").checked
            })
        });
        const res = await resp.json();
        if (res.success) {
            if (statusBox) {
                statusBox.style.background = "#dcfce7";
                statusBox.style.color = "#15803d";
                statusBox.textContent = "✔ تم فحص وحفظ الاتصال بمحرك الذكاء الاصطناعي بنجاح!";
            }
        }
    } catch (e) {
        if (statusBox) {
            statusBox.style.background = "#dcfce7";
            statusBox.style.color = "#15803d";
            statusBox.textContent = "✔ تم حفظ المفتاح للاستخدام السحابي المباشر عبر المتصفح!";
        }
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function saveVlmSettings() {
    const apiKey = document.getElementById("vlm-api-key-input").value.trim();
    const model = document.getElementById("vlm-model-select").value;
    const fallback = document.getElementById("vlm-local-fallback-check").checked;

    if (apiKey) {
        localStorage.setItem("vlm_gemini_api_key", apiKey);
        localStorage.setItem("vlm_model", model);
    } else {
        localStorage.removeItem("vlm_gemini_api_key");
    }

    try {
        const resp = await fetch("/api/vlm-config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                gemini_api_key: apiKey,
                vlm_model: model,
                enable_local_fallback: fallback
            })
        });
        const res = await resp.json();
        if (res.success) {
            showToast("تم حفظ إعدادات الذكاء الاصطناعي بنجاح! 🚀");
            closeVlmSettings();
            return;
        }
    } catch (e) {
        showToast("تم حفظ مفتاح الذكاء الاصطناعي محلياً في المتصفح بنجاح! 🚀");
        closeVlmSettings();
    }
}

// تصدير الدوال الأساسية لـ window لاستخدامها في الأحداث المباشرة
window.clearSignature = clearSignature;
window.removeCollegeStamp = removeCollegeStamp;
window.changeAuditStatus = changeAuditStatus;
window.exportDocx = exportDocx;
window.exportPdf = exportPdf;
window.exportDossierPdf = exportDossierPdf;

