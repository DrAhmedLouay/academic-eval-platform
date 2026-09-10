import Foundation
import Vision
import PDFKit
import AppKit

struct LineInfo: Codable {
    let text: String
    let confidence: Float
}

struct PageResult: Codable {
    let page_index: Int
    let text: String
    let lines: [LineInfo]
}

struct OCRResponse: Codable {
    let success: Bool
    let full_text: String
    let pages: [PageResult]
    let error: String?
}

func recognizeTextInCGImage(_ cgImg: CGImage) -> (String, [LineInfo]) {
    var extractedLines: [LineInfo] = []
    let semaphore = DispatchSemaphore(value: 0)

    let request = VNRecognizeTextRequest { req, err in
        defer { semaphore.signal() }
        guard let observations = req.results as? [VNRecognizedTextObservation] else { return }
        for obs in observations {
            if let top = obs.topCandidates(1).first {
                let trimmed = top.string.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    extractedLines.append(LineInfo(text: trimmed, confidence: top.confidence))
                }
            }
        }
    }

    request.recognitionLanguages = ["ar-SA", "ars-SA", "en-US"]
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: cgImg, options: [:])
    do {
        try handler.perform([request])
        _ = semaphore.wait(timeout: .now() + 25.0)
    } catch {
        // Handle error
    }

    let pageText = extractedLines.map { $0.text }.joined(separator: "\n")
    return (pageText, extractedLines)
}

func processFile(path: String, maxPages: Int = 3) -> OCRResponse {
    let fileUrl = URL(fileURLWithPath: path)
    let ext = fileUrl.pathExtension.lowercased()

    if ext == "pdf" {
        guard let doc = PDFDocument(url: fileUrl) else {
            return OCRResponse(success: false, full_text: "", pages: [], error: "Could not open PDF file")
        }

        var pagesResult: [PageResult] = []
        var allPagesText: [String] = []
        let count = min(maxPages, doc.pageCount)

        for i in 0..<count {
            guard let page = doc.page(at: i) else { continue }
            let bounds = page.bounds(for: .mediaBox)
            let scale: CGFloat = 2.5
            let renderSize = CGSize(width: max(800, bounds.width * scale), height: max(1000, bounds.height * scale))
            let pageImg = page.thumbnail(of: renderSize, for: .mediaBox)

            guard let cgImg = pageImg.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
                continue
            }

            let (pText, pLines) = recognizeTextInCGImage(cgImg)
            if !pText.isEmpty {
                pagesResult.append(PageResult(page_index: i, text: pText, lines: pLines))
                allPagesText.append(pText)
            }
        }

        let fullText = allPagesText.joined(separator: "\n\n--- صفحة تالية ---\n\n")
        return OCRResponse(success: true, full_text: fullText, pages: pagesResult, error: nil)

    } else {
        // Image formats (JPG, PNG, WEBP, BMP, etc.)
        guard let nsImg = NSImage(contentsOfFile: path),
              let cgImg = nsImg.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            return OCRResponse(success: false, full_text: "", pages: [], error: "Could not open image file")
        }

        let (pText, pLines) = recognizeTextInCGImage(cgImg)
        let pageResult = PageResult(page_index: 0, text: pText, lines: pLines)
        return OCRResponse(success: true, full_text: pText, pages: [pageResult], error: nil)
    }
}

// Entry point
let args = CommandLine.arguments
if args.count < 2 {
    let res = OCRResponse(success: false, full_text: "", pages: [], error: "Missing file path argument")
    if let data = try? JSONEncoder().encode(res), let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(1)
}

let filePath = args[1]
let maxPages = args.count > 2 ? (Int(args[2]) ?? 3) : 3
let result = processFile(path: filePath, maxPages: maxPages)

let encoder = JSONEncoder()
if let data = try? encoder.encode(result), let jsonStr = String(data: data, encoding: .utf8) {
    print(jsonStr)
} else {
    print("{\"success\":false,\"error\":\"JSON encoding failed\",\"full_text\":\"\",\"pages\":[]}")
}
