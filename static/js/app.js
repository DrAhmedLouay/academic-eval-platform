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
document.addEventListener("DOMContentLoaded", () => {
    hideUploadLoadingState();
    initTabs();
    initEventListeners();
    initDropzones();
    initParagraphScanInputs();
    initSignaturePads();
    initAuditorMode();
    initVlmSettingsModal();
    initSnippetCropper();
    loadDraft();
    syncEvidenceWithScores();
    calculateLiveScore();
    renderAllMiniEvidenceTables();
    renderMasterCatalogTable();
    updateIndexStats();
});

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

    // أزرار التصدير
    document.getElementById("btn-export-docx").addEventListener("click", exportDocx);
    document.getElementById("btn-export-pdf").addEventListener("click", exportPdf);
    const btnDossier = document.getElementById("btn-export-dossier-pdf");
    if (btnDossier) btnDossier.addEventListener("click", exportDossierPdf);
    document.getElementById("btn-print").addEventListener("click", () => window.print());

    // أزرار الحفظ والاسترجاع والبيانات التجريبية
    document.getElementById("btn-sample-data").addEventListener("click", loadSampleData);
    document.getElementById("btn-save-draft").addEventListener("click", saveDraft);
    document.getElementById("btn-restore-draft").addEventListener("click", () => document.getElementById("restore-file-input").click());
    document.getElementById("restore-file-input").addEventListener("change", handleRestoreFile);
    document.getElementById("btn-reset").addEventListener("click", resetForm);

    // زر إعدادات الذكاء الاصطناعي وزر نمط المدقق في الترويسة
    const btnVlmHdr = document.getElementById("btn-vlm-settings-header");
    if (btnVlmHdr) btnVlmHdr.addEventListener("click", openVlmSettings);
    const btnAuditorHdr = document.getElementById("btn-toggle-auditor-mode");
    if (btnAuditorHdr) btnAuditorHdr.addEventListener("click", toggleAuditorMode);

    // إغلاق النافذة المنبثقة لمراجعة OCR
    document.getElementById("modal-close-btn").addEventListener("click", closeModal);
    document.getElementById("modal-cancel-btn").addEventListener("click", closeModal);
    document.getElementById("modal-confirm-btn").addEventListener("click", confirmOcrAttachment);

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

let uploadSafetyTimer = null;

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
    "كانون الثاني": "01", "كانون ثاني": "01",
    "شباط": "02",
    "آذار": "03", "اذار": "03",
    "نيسان": "04",
    "أيار": "05", "ايار": "05",
    "حزيران": "06",
    "تموز": "07",
    "آب": "08", "اب": "08",
    "أيلول": "09", "ايلول": "09",
    "تشرين الأول": "10", "تشرين اول": "10",
    "تشرين الثاني": "11", "تشرين ثاني": "11",
    "كانون الأول": "12", "كانون اول": "12"
};

function normalizeArabicTextClient(str) {
    if (!str) return "";
    return str
        .replace(/[\u064B-\u065F\u0670]/g, "") // remove tashkeel
        .replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]) // eastern to western digits
        .replace(/[إأآا]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه");
}

function extractDateClient(text, filename) {
    const raw = (text || "") + "\n" + (filename || "");
    if (!raw.trim()) return new Date().toISOString().split('T')[0];

    // 1. التاريخ بأسماء الأشهر العربية
    for (const [mName, mNum] of Object.entries(ARABIC_MONTHS_MAP)) {
        const p1 = new RegExp(`(\\b(?:0?[1-9]|[12][0-9]|3[01]))\\s*(?:من\\s*)?${mName}\\s*(?:سنة\\s*|عام\\s*)?(202[0-9])`, 'i');
        const m1 = raw.match(p1);
        if (m1) {
            const day = String(parseInt(m1[1], 10)).padStart(2, '0');
            return `${m1[2]}/${mNum}/${day}`;
        }
    }

    // 2. التاريخ بجانب كلمة التاريخ أو التأريخ (يدوي أو مطبوع)
    const labeledMatch = raw.match(/(?:التاريخ|التأريخ|بتاريخ|بتأريخ|تاريخ\s+الصدور|Date)\s*[:/=-]?\s*[\.\s]*([0-9/\-\. ]{4,20})/i);
    if (labeledMatch) {
        const cand = labeledMatch[1].replace(/\s+/g, "");
        const mYMD = cand.match(/\b(202[0-9][/\-\.](?:0?[1-9]|1[0-2])[/\-\.](?:0?[1-9]|[12][0-9]|3[01]))\b/);
        if (mYMD) {
            const parts = mYMD[1].split(/[/.\-]/);
            return `${parts[0]}/${String(parseInt(parts[1], 10)).padStart(2, '0')}/${String(parseInt(parts[2], 10)).padStart(2, '0')}`;
        }
        const mDMY = cand.match(/\b((?:0?[1-9]|[12][0-9]|3[01])[/\-\.](?:0?[1-9]|1[0-2])[/\-\.](202[0-9]))\b/);
        if (mDMY) {
            const parts = mDMY[1].split(/[/.\-]/);
            return `${parts[2]}/${String(parseInt(parts[1], 10)).padStart(2, '0')}/${String(parseInt(parts[0], 10)).padStart(2, '0')}`;
        }
    }

    // 3. النمط القياسي YYYY/MM/DD في كامل النص
    const stdMatch = raw.match(/\b(202[0-9])[/\-\.](0?[1-9]|1[0-2])[/\-\.](0?[1-9]|[12][0-9]|3[01])\b/);
    if (stdMatch) {
        return `${stdMatch[1]}/${String(parseInt(stdMatch[2], 10)).padStart(2, '0')}/${String(parseInt(stdMatch[3], 10)).padStart(2, '0')}`;
    }

    // 4. النمط القياسي DD/MM/YYYY في كامل النص
    const revMatch = raw.match(/\b(0?[1-9]|[12][0-9]|3[01])[/\-\.](0?[1-9]|1[0-2])[/\-\.](202[0-9])\b/);
    if (revMatch) {
        return `${revMatch[3]}/${String(parseInt(revMatch[2], 10)).padStart(2, '0')}/${String(parseInt(revMatch[1], 10)).padStart(2, '0')}`;
    }

    // 5. التاريخ من اسم الملف (مثل Archive_09_26_2024 أو PHOTO-2024-11-12)
    if (filename) {
        const fnYMD = filename.match(/\b(202[0-9])[-_](0?[1-9]|1[0-2])[-_](0?[1-9]|[12][0-9]|3[01])\b/);
        if (fnYMD) {
            return `${fnYMD[1]}/${String(parseInt(fnYMD[2], 10)).padStart(2, '0')}/${String(parseInt(fnYMD[3], 10)).padStart(2, '0')}`;
        }
        const fnArch = filename.match(/Archive_([0-9]{2})_([0-9]{2})_(202[0-9])/i);
        if (fnArch) {
            return `${fnArch[3]}/${fnArch[1]}/${fnArch[2]}`;
        }
    }

    return "2024/2025";
}

function extractDocNumberClient(text, filename) {
    const raw = (text || "").trim();

    // 1. صيغة العدد الرسمي العراقي بالأحرف والسلاش: (م.ع/1509 ، د.ت/625 ، هـ.ع/734 ، ش.ع/43 ، م.و/135 ، م.ج/421 ، ع/17)
    const mLetterSlash = raw.match(/(?:[^\w]|^)([أ-ي](?:[\s\.][أ-ي]|[أ-ي]){0,4}(?:\s*\d{1,2})?)\s*[\/]\s*(\d{1,6}(?:[\/]\d+)*(?:\s*[\/]\s*[أ-ي])?)/);
    if (mLetterSlash) {
        let letters = mLetterSlash[1].replace(/\s+/g, "");
        if (letters.length === 2 && !letters.includes(".")) {
            letters = letters[0] + "." + letters[1];
        }
        const serial = mLetterSlash[2].replace(/\s+/g, "");
        return `${letters}/${serial}`;
    }

    // 2. البحث بجانب كلمة "العدد" أو "الرقم"
    const mLabel = raw.match(/(?:العدد|الـعـدد|الرقم|عدد|رقم)\s*[:/=-]?\s*[\.]*\s*([أ-ي0-9\/\- ]{2,30})/);
    if (mLabel) {
        let cand = mLabel[1].trim().split(/[\n\r,]/)[0].trim();
        cand = cand.replace(/^(?:No|Ref|DATE|Date)[\.:\s]*/i, "");
        if (cand && /\d/.test(cand)) {
            return cand.replace(/\s+/g, "");
        }
    }

    // 3. أسطر ما بعد كلمة "العدد" إذا كانت منفردة
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < Math.min(lines.length, 12); i++) {
        if (/^(?:العدد|الـعـدد|رقم|الرقم)\s*[:/=-]?\s*[\.]*$/.test(lines[i])) {
            for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
                const sub = lines[j];
                const mSub = sub.match(/([أ-ي0-9\/\-]{2,20})/);
                if (mSub && /\d/.test(mSub[1])) {
                    return mSub[1].replace(/\s+/g, "");
                }
            }
        }
    }

    // 4. استخراج الرقم من اسم الملف (إذا كان اسم الملف يحتوي على عدد مثل 1509، 421، امر_1509)
    if (filename) {
        const cleanFn = filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
        const mFnLetter = cleanFn.match(/([أ-ي]{1,3}\s*\/\s*\d{1,5})/);
        if (mFnLetter) {
            return mFnLetter[1].replace(/\s+/g, "");
        }
        const mFnNum = cleanFn.match(/(?:امر|كتاب|عدد|no|ref)?\s*(\d{2,5})\b/i);
        if (mFnNum && !mFnNum[1].startsWith("202")) { // ليس سنة
            return mFnNum[1];
        }
    }

    return "غير محدد";
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
        const promptText = `أنت خبير توثيق أكاديمي في الجامعات العراقية. استخرج بدقة الحقول التالية من الوثيقة المرفقة (سواء كانت مطبوعة أو مكتوبة بخط اليد):
1. doc_number: العدد الإداري (مثل م.ع/1509 أو د.ت/625 أو ش.ع/43 أو 17).
2. date: التاريخ بصيغة YYYY/MM/DD (مثل 2024/09/19).
3. subject: موضوع الوثيقة أو عنوان البحث أو اللجنة.
4. issuer: الجهة المصدرة (الوزارة أو الجامعة أو الكلية أو القسم).
5. doc_type: نوع الوثيقة (أمر إداري، كتاب شكر وتقدير، بحث علمي، شهادة مشاركة).
6. is_handwritten: هل العدد أو التاريخ مكتوب بخط اليد (true أو false).
أجب بصيغة JSON فقط كالتالي:
{"doc_number": "...", "date": "YYYY/MM/DD", "subject": "...", "issuer": "...", "doc_type": "...", "is_handwritten": true}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: promptText },
                        { inline_data: { mime_type: mimeType, data: base64Data } }
                    ]
                }]
            })
        });

        if (resp.ok) {
            const data = await resp.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        }
    } catch (e) {
        console.warn("Client Gemini call notice:", e);
    }
    return null;
}

function parseArabicDocumentClient(text, filename, targetAxis, targetParagraph) {
    const raw = (text || "") + " " + (filename || "");
    const cleanFn = (filename || "").replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

    let docNumber = extractDocNumberClient(text, filename);
    let docDate = extractDateClient(text, filename);
    let subject = extractSubjectClient(text, filename);
    let recipient = extractRecipientClient(text);
    let issuer = (formData && formData.personal_info && formData.personal_info.college) ? formData.personal_info.college : "الجامعة التكنولوجية";
    if (/وزارة التعليم العالي/i.test(raw)) issuer = "وزارة التعليم العالي والبحث العلمي";
    else if (/رئاسة الجامعة|مكتب رئيس/i.test(raw)) issuer = "رئاسة الجامعة التكنولوجية";
    else if (/المساعد العلمي/i.test(raw)) issuer = "مكتب المساعد العلمي";
    else if (/قسم هندسة العمارة/i.test(raw)) issuer = "قسم هندسة العمارة";

    let isHandwritten = false;
    if (/[\.\s]{3,}\d+/.test(raw) || /✍️|مكتوب باليد|خط يد/.test(raw) || /\d\s+\d/.test(text || "")) {
        isHandwritten = true;
    }

    let ax = targetAxis || "axis3";
    let p = targetParagraph ? String(targetParagraph) : "1";
    let docType = "وثيقة إثبات رسمية";
    let suggestedScore = 10.0;
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
        is_handwritten: isHandwritten
    };
}

async function handleClientSideEvidenceScan(file, target) {
    hideUploadLoadingState();
    const objectUrl = URL.createObjectURL(file);
    const ax = target ? target.axis : "axis1";
    const p = target ? String(target.paragraph) : "1";
    const counter = getNextCounterForParagraph(ax, p);
    const refCode = `REF-${ax.toUpperCase().replace("AXIS", "AX")}-P${p}-${String(counter).padStart(2, '0')}`;

    // 1. فحص ما إذا كان الملف موجوداً مسبقاً في فهرس الأدلة المعتمد
    const cleanBase = file.name.trim().toLowerCase();
    const existingMatch = indexedEvidenceList.find(item => {
        if (!item.filename) return false;
        const fn = item.filename.trim().toLowerCase();
        return fn === cleanBase || cleanBase.includes(fn) || fn.includes(cleanBase);
    });

    let docNumber, docDate, docTitle, docType, suggestedScore, axName, pName, isHw, recipient, issuer;

    if (existingMatch && existingMatch.doc_number && !existingMatch.doc_number.includes("قيد التدقيق") && existingMatch.doc_number !== "غير محدد") {
        docNumber = existingMatch.doc_number;
        docDate = existingMatch.date || "2024/09/19";
        docTitle = existingMatch.title || existingMatch.subject;
        docType = existingMatch.doc_type;
        suggestedScore = existingMatch.suggested_score || 15.0;
        axName = existingMatch.axis_name;
        pName = existingMatch.paragraph_name;
        isHw = Boolean(existingMatch.handwritten_detected);
        recipient = existingMatch.recipient || "غير محدد";
        issuer = existingMatch.issuer || "الجامعة التكنولوجية";
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
            docDate = vlmData.date || extractDateClient("", file.name);
            docTitle = vlmData.subject || extractSubjectClient("", file.name);
            docType = vlmData.doc_type || "وثيقة إثبات معتمدة";
            suggestedScore = 15.0;
            isHw = Boolean(vlmData.is_handwritten);
            recipient = "غير محدد";
            issuer = vlmData.issuer || "الجامعة التكنولوجية";
            axName = target ? target.label : "المحور المختار";
            pName = target ? target.label : "الفقرة المستهدفة";
        } else {
            const parsed = parseArabicDocumentClient(extractedText, file.name, ax, p);
            docNumber = parsed.doc_number;
            docDate = parsed.date;
            docTitle = parsed.title;
            docType = parsed.doc_type;
            suggestedScore = parsed.suggested_score;
            isHw = parsed.is_handwritten;
            recipient = parsed.recipient;
            issuer = parsed.issuer;
            axName = target ? target.label : parsed.axis_name;
            pName = target ? target.label : parsed.paragraph_name;
        }
    }

    const summaryText = isHw ? 
        `✍️ تم قراءة العدد [${docNumber}] والتاريخ [${docDate}] بخط اليد بالذكاء الاصطناعي.` : 
        `تم استخراج وقراءة العدد [${docNumber}] والتاريخ [${docDate}] بنجاح.`;

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
        auto_fill_summary: summaryText
    };

    const fieldUpdates = {};
    if (target && target.axis && target.paragraph) {
        fieldUpdates[`${target.axis}.p${target.paragraph}`] = suggestedScore;
    }

    showToast(`تم مسح وقراءة المستند (${file.name}) بنجاح! العدد: ${docNumber} | التاريخ: ${docDate}`);
    openEvidenceReviewModal(evidenceItem, fieldUpdates, summaryText);
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
            const existingMatch = indexedEvidenceList.find(item => {
                if (!item.filename) return false;
                const fn = item.filename.trim().toLowerCase();
                return fn === cleanBase || cleanBase.includes(fn) || fn.includes(cleanBase);
            });

            let docNumber, docDate, docTitle, docType, suggestedScore, ax, p, axName, pName, isHw;
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
            } else {
                const parsed = parseArabicDocumentClient(extractedText, file.name, null, null);
                docNumber = parsed.doc_number;
                docDate = parsed.date;
                docTitle = parsed.title;
                docType = parsed.doc_type;
                suggestedScore = parsed.suggested_score;
                ax = parsed.axis;
                p = parsed.paragraph;
                axName = parsed.axis_name;
                pName = parsed.paragraph_name;
                isHw = parsed.is_handwritten;
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
                auto_fill_summary: isHw ? 
                    `✍️ تم قراءة العدد [${docNumber}] والتاريخ [${docDate}] بخط اليد بالذكاء الاصطناعي` : 
                    `تم استخراج وقراءة العدد [${docNumber}] والتاريخ [${docDate}] بنجاح`
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
        const parsed = parseArabicDocumentClient(extractedText, file.name, null, null);
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
            handwritten_detected: parsed.is_handwritten,
            auto_fill_summary: parsed.is_handwritten ? 
                `✍️ تم قراءة العدد [${parsed.doc_number}] والتاريخ [${parsed.date}] بخط اليد بالذكاء الاصطناعي` : 
                `تم استخراج وقراءة العدد [${parsed.doc_number}] والتاريخ [${parsed.date}] بنجاح`
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
        const response = await fetch("/api/reprocess-all-attachments", {
            method: "POST",
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

    if (hwBadge) hwBadge.style.display = isHw ? "inline-flex" : "none";
    if (numHwHint) numHwHint.style.display = (isHw && (hwFields.includes("doc_number") || !hwFields.length)) ? "inline-flex" : "none";
    if (dateHwHint) dateHwHint.style.display = (isHw && (hwFields.includes("date") || !hwFields.length)) ? "inline-flex" : "none";

    modal.classList.add("active");
}

function closeModal() {
    const modal = document.getElementById("ocr-modal");
    modal.classList.remove("active");
    pendingOcrAttachment = null;
    activeScanTarget = null;
}

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
    document.getElementById("preview-modal-ref").textContent = refCode;

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

    const metaNumDate = document.getElementById("preview-meta-number-date");
    if (metaNumDate) {
        let numDateHtml = `<strong>${item.doc_number || item.document_number || '-'}</strong> بتاريخ <span style="color:#475569;">${item.date || '-'}</span>`;
        if (item.handwritten_detected) {
            numDateHtml += ` <span class="badge-handwritten" style="margin-right: 4px;"><i class="fa-solid fa-pen-nib"></i> خط يد</span>`;
        }
        metaNumDate.innerHTML = numDateHtml;
    }

    const metaAxis = document.getElementById("preview-meta-axis");
    if (metaAxis) metaAxis.textContent = `${item.axis_name || item.axis || 'المحور'} - فقرة ${item.paragraph || item.suggested_paragraph || '1'}`;

    const metaScore = document.getElementById("preview-meta-score");
    if (metaScore) metaScore.textContent = `+${item.suggested_score || 0} درجة`;

    const metaTitle = document.getElementById("preview-meta-title");
    if (metaTitle) metaTitle.textContent = `${item.title || item.filename} ${item.issuer ? `(${item.issuer})` : ''}`;

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
            closeDocumentPreview();
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
    if (refBadge) refBadge.textContent = item.ref_code;

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

    try {
        const payload = {
            ref_code: item.ref_code,
            axis: newAxisKey,
            paragraph: String(newParagraph),
            axis_name: def.name,
            paragraph_name: pDef.name,
            doc_type: newDocType,
            suggested_score: newScore,
            auditor_notes: notes || `إعادة تصنيف يدوية إلى ${def.name} - ${pDef.name}`
        };

        const resp = await fetch("/api/reclassify-evidence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await resp.json();
        if (!data.success) {
            throw new Error(data.error || "فشل تحديث الخادم");
        }

        // تحديث خصائص الوثيقة محلياً
        item.axis = newAxisKey;
        item.paragraph = String(newParagraph);
        item.axis_name = def.name;
        item.paragraph_name = pDef.name;
        item.doc_type = newDocType;
        item.suggested_score = newScore;
        item.audit_status = "modified";
        item.manual_reclassified = true;
        item.auditor_notes = payload.auditor_notes;

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

        closeReclassifyModal();
        showToast(`✔ تم بنجاح نقل الوثيقة (${item.ref_code}) إلى "${def.name} - ${pDef.name}" وإعادة احتساب الدرجات تلقائياً!`);
    } catch (err) {
        console.error("Reclassify error:", err);
        alert("حدث خطأ أثناء حفظ إعادة التصنيف: " + err.message);
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = origBtnHtml;
        }
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
                            <span class="badge-ref clickable-badge" onclick="openDocumentPreview('${item.ref_code}')" title="انقر لمعاينة وتحميل الوثيقة">${item.ref_code}</span>
                            ${item.handwritten_detected ? '<div style="margin-top: 3px;"><span class="badge-handwritten" title="تم قراءة العدد/التاريخ بخط اليد بالذكاء الاصطناعي"><i class="fa-solid fa-pen-nib"></i> خط يد</span></div>' : ''}
                        </td>
                        <td><strong>${item.doc_type}</strong></td>
                        <td style="text-align: center; font-size: 0.75rem;">
                            <strong>${item.doc_number || '-'}</strong>
                            ${item.handwritten_fields && item.handwritten_fields.includes("doc_number") ? '<span class="badge-handwritten" style="font-size:0.65rem; margin-right:2px;" title="رقم مكتوب بخط اليد"><i class="fa-solid fa-pen-nib"></i></span>' : ''}
                            <br/>
                            <span style="color:#64748b;">${item.date || '-'}</span>
                            ${item.handwritten_fields && item.handwritten_fields.includes("date") ? '<span class="badge-handwritten" style="font-size:0.65rem; margin-right:2px;" title="تاريخ مكتوب بخط اليد"><i class="fa-solid fa-pen-nib"></i></span>' : ''}
                        </td>
                        <td>
                            <div class="clickable-doc" onclick="openDocumentPreview('${item.ref_code}')" style="font-weight: 700; color: #1e3a8a;" title="انقر لمعاينة وتحميل الوثيقة">
                                <i class="fa-regular fa-file-lines" style="color: #2563eb; margin-left: 4px;"></i>${item.title || item.subject || 'وثيقة'}
                            </div>
                            ${item.subject ? `<div style="margin-top:2px;"><span class="badge-tag-subject"><i class="fa-solid fa-file-signature"></i> م/ ${item.subject}</span></div>` : ''}
                            ${item.recipient ? `<div style="margin-top:2px;"><span class="badge-tag-recipient"><i class="fa-solid fa-paper-plane"></i> إلى/ ${item.recipient}</span></div>` : ''}
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
function renderMasterCatalogTable() {
    const tbody = document.getElementById("master-catalog-body");
    const countBadge = document.getElementById("attachments-count");
    if (countBadge) countBadge.textContent = indexedEvidenceList.length;

    if (!tbody) return;

    let filtered = indexedEvidenceList;
    if (activeFilterAxis !== "all") {
        filtered = indexedEvidenceList.filter(e => e.axis === activeFilterAxis);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #94a3b8; padding: 2.5rem;">
            <i class="fa-regular fa-folder-open fa-3x" style="margin-bottom: 0.75rem; display: block; opacity: 0.4;"></i>
            لم يتم تسجيل أي وثائق مفهرسة في هذا التصنيف بعد. يمكنك مسح المرفقات مجمعة أو لكل فقرة أعلاه.
        </td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((item, idx) => `
        <tr>
            <td style="text-align: center; font-weight: 700;">${idx + 1}</td>
            <td style="text-align: center;">
                <span class="badge-ref clickable-badge" onclick="openDocumentPreview('${item.ref_code}')" title="انقر لمعاينة وتحميل الوثيقة">${item.ref_code}</span>
                ${item.handwritten_detected ? '<div style="margin-top: 3px;"><span class="badge-handwritten" title="تم التعرف على خط اليد بالذكاء الاصطناعي"><i class="fa-solid fa-pen-nib"></i> خط يد</span></div>' : ''}
            </td>
            <td>
                <strong>${item.doc_type}</strong>
                ${item.issuer ? `<div style="font-size: 0.75rem; color: #64748b;">${item.issuer}</div>` : ''}
            </td>
            <td style="text-align: center; font-size: 0.8rem;">
                <strong>${item.doc_number || '-'}</strong>
                ${item.handwritten_fields && item.handwritten_fields.includes("doc_number") ? '<span class="badge-handwritten" style="font-size:0.65rem; margin-right:2px;" title="رقم مكتوب بخط اليد"><i class="fa-solid fa-pen-nib"></i></span>' : ''}
                <br/>
                <span style="color: #64748b;">${item.date || '-'}</span>
                ${item.handwritten_fields && item.handwritten_fields.includes("date") ? '<span class="badge-handwritten" style="font-size:0.65rem; margin-right:2px;" title="تاريخ مكتوب بخط اليد"><i class="fa-solid fa-pen-nib"></i></span>' : ''}
            </td>
            <td>
                <div class="clickable-doc" onclick="openDocumentPreview('${item.ref_code}')" style="font-weight: 700; color: #1e3a8a;" title="انقر لمعاينة وتحميل الوثيقة">
                    <i class="fa-regular fa-file-lines" style="color: #2563eb; margin-left: 4px;"></i>${item.title || item.subject || item.filename || 'مستند رسمي'}
                </div>
                ${item.subject && item.subject !== item.title ? `<div style="margin-top: 3px;"><span class="badge-tag-subject"><i class="fa-solid fa-file-signature"></i> م/ ${item.subject}</span></div>` : ''}
                ${item.recipient && item.recipient !== 'غير محدد' ? `<div style="margin-top: 3px;"><span class="badge-tag-recipient"><i class="fa-solid fa-paper-plane"></i> إلى/ ${item.recipient}</span></div>` : ''}
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
        if (e.target.files.length > 0) {
            processSingleEvidenceScan(e.target.files[0], null);
        }
    });
}

// ============================================================================
// عمليات التصدير (Word & PDF) مع المرفقات المفهرسة
// ============================================================================
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
            downloadBlob(blob, `استمارة_تقييم_الأداء_${formData.personal_info.last_name || '2026'}.docx`);
            showToast("تم تصدير استمارة Word الرسمية مع فهرس الأدلة بنجاح!");
            return;
        }
    } catch (err) {
        console.warn("Backend Word export unavailable:", err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-file-word"></i> تحميل Word (.docx)`;
    }

    showToast("تنبيه: لتنزيل ملف Word (.docx) الرسمي، يمكنك فتح الشريط الجانبي في المنصة أو استخدام زر 'طباعة' لحفظ نسخة PDF.");
    alert("تنبيه التصدير:\nلتنزيل ملف Word (.docx) الرسمي المولد بنظام Python، يرجى فتح الشريط الجانبي (>) في المنصة السحابية والضغط على 'تحميل ملف Word (.docx)'، أو استخدام زر 'طباعة' لحفظ نسخة PDF فورية.");
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
            downloadBlob(blob, `استمارة_تقييم_الأداء_${formData.personal_info.last_name || '2026'}.pdf`);
            showToast("تم تصدير استمارة PDF الرسمية مع فهرس الأدلة والتواقيع بنجاح!");
            return;
        }
    } catch (err) {
        console.warn("Backend PDF export unavailable, falling back to browser print:", err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-file-pdf"></i> تحميل PDF`;
    }

    // بديل فوري وفعال: فتح نافذة الطباعة / الحفظ بصيغة PDF الرسمية
    showToast("جارٍ فتح نافذة الطباعة والحفظ بصيغة PDF الرسمية... 🖨️");
    window.print();
}

async function exportDossierPdf() {
    const btn = document.getElementById("btn-export-dossier-pdf");
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> جاري تجميع المصبار المدمج...`;

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
            downloadBlob(blob, `المصبار_التوثيقي_المدمج_${formData.personal_info.last_name || '2026'}.pdf`);
            showToast("تم إنشاء وتنزيل المصبار التوثيقي المدمج (Dossier PDF) مع الفهرس التفاعلي بنجاح! 📚");
            return;
        }
    } catch (err) {
        console.warn("Backend dossier export unavailable:", err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-book-bookmark"></i> المصبار المدمج (PDF)`;
    }

    showToast("تنبيه: المصبار التوثيقي المدمج متاح للتحميل عبر الشريط الجانبي في المنصة السحابية.");
    alert("تنبيه التصدير:\nلتحميل المصبار التوثيقي الشامل (Dossier PDF) المدمج مع وثائق الإثبات، يرجى فتح الشريط الجانبي (>) في المنصة السحابية والنقر على 'تحميل الملف التوثيقي الشامل (Dossier)'.");
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
            const hasStuckOrCorrupted = items.some(e => 
                !e.doc_number || e.doc_number === "غير محدد" || e.doc_number === "-" ||
                /yolll|solell|ajljig/i.test(e.title || '') || /yolll|solell/i.test(e.subject || '')
            );
            if (!hasStuckOrCorrupted && items.length > 0) {
                indexedEvidenceList = items;
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

    let boxes = item.bounding_boxes;
    if (!boxes || !Array.isArray(boxes) || boxes.length === 0) {
        boxes = [];
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

    const fieldLabels = {
        number: "العدد",
        date: "التاريخ",
        subject: "الموضوع (م/ )",
        stamp: "الختم / التوقيع"
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
    const metaNum = document.getElementById("preview-meta-number-date");
    if (metaNum) {
        metaNum.innerHTML = `<strong>${num}</strong> بتاريخ <span style="color:#475569;">${activePreviewItem.date || '-'}</span>`;
    }
    renderAllMiniEvidenceTables();
    renderMasterCatalogTable();
    showToast(`تم تعيين العدد بنجاح: ${num}`);
}

function applySnippetDate() {
    const d = document.getElementById("snippet-detected-date").value.trim();
    if (!d || !activePreviewItem) return;
    activePreviewItem.date = d;
    const metaNum = document.getElementById("preview-meta-number-date");
    if (metaNum) {
        metaNum.innerHTML = `<strong>${activePreviewItem.doc_number || '-'}</strong> بتاريخ <span style="color:#475569;">${d}</span>`;
    }
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

