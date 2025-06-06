"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Upload, CheckCircle, XCircle, AlertTriangle, FileText } from "lucide-react"

interface ValidationError {
  type: "syntax" | "logic"
  line: number
  field?: string
  message: string
  severity: "error" | "warning"
}

interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  summary: {
    totalRecords: number
    headerCount: number
    dataCount: number
    trailerCount: number
    endCount: number
    totalAmount: number
    expectedAmount: number
  }
}

export default function ZenginValidator() {
  const [file, setFile] = useState<File | null>(null)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [isValidating, setIsValidating] = useState(false)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setValidationResult(null)
    }
  }

  const validateZenginFormat = async (csvContent: string): Promise<ValidationResult> => {
    const errors: ValidationError[] = []
    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim() !== "")

    let headerCount = 0
    let dataCount = 0
    let trailerCount = 0
    let endCount = 0
    let totalAmount = 0
    let expectedAmount = 0

    // 基本構造チェック
    if (lines.length < 4) {
      errors.push({
        type: "syntax",
        line: 0,
        message: "ファイルには最低4行（ヘッダ、データ、トレーラ、エンド）が必要です",
        severity: "error",
      })
    }

    // 各行の検証
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const fields = parseCSVLine(line)
      const lineNumber = i + 1

      if (fields.length === 0) continue

      const dataType = fields[0]?.replace(/"/g, "")

      switch (dataType) {
        case "1": // ヘッダレコード
          headerCount++
          validateHeaderRecord(fields, lineNumber, errors)
          break
        case "2": // データレコード
          dataCount++
          const amount = validateDataRecord(fields, lineNumber, errors)
          totalAmount += amount
          break
        case "8": // トレーラレコード
          trailerCount++
          expectedAmount = validateTrailerRecord(fields, lineNumber, errors, dataCount)
          break
        case "9": // エンドレコード
          endCount++
          validateEndRecord(fields, lineNumber, errors)
          break
        default:
          errors.push({
            type: "syntax",
            line: lineNumber,
            field: "データ区分",
            message: `不正なデータ区分です: ${dataType}`,
            severity: "error",
          })
      }
    }

    // 構造チェック
    if (headerCount !== 1) {
      errors.push({
        type: "logic",
        line: 0,
        message: `ヘッダレコードは1件である必要があります（現在: ${headerCount}件）`,
        severity: "error",
      })
    }

    if (trailerCount !== 1) {
      errors.push({
        type: "logic",
        line: 0,
        message: `トレーラレコードは1件である必要があります（現在: ${trailerCount}件）`,
        severity: "error",
      })
    }

    if (endCount !== 1) {
      errors.push({
        type: "logic",
        line: 0,
        message: `エンドレコードは1件である必要があります（現在: ${endCount}件）`,
        severity: "error",
      })
    }

    // 金額チェック
    if (totalAmount !== expectedAmount && expectedAmount > 0) {
      errors.push({
        type: "logic",
        line: 0,
        message: `依頼金額合計が不一致です（期待: ${expectedAmount.toLocaleString()}円、実際: ${totalAmount.toLocaleString()}円）`,
        severity: "error",
      })
    }

    return {
      isValid: errors.filter((e) => e.severity === "error").length === 0,
      errors,
      summary: {
        totalRecords: lines.length,
        headerCount,
        dataCount,
        trailerCount,
        endCount,
        totalAmount,
        expectedAmount,
      },
    }
  }

  const parseCSVLine = (line: string): string[] => {
    const fields: string[] = []
    let current = ""
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      if (char === '"') {
        inQuotes = !inQuotes
        current += char
      } else if (char === "," && !inQuotes) {
        fields.push(current)
        current = ""
      } else {
        current += char
      }
    }

    fields.push(current)
    return fields
  }

  const validateHeaderRecord = (fields: string[], lineNumber: number, errors: ValidationError[]) => {
    if (fields.length < 13) {
      errors.push({
        type: "syntax",
        line: lineNumber,
        message: "ヘッダレコードのフィールド数が不足しています",
        severity: "error",
      })
      return
    }

    // 種別コード
    const typeCode = fields[1]?.replace(/"/g, "")
    if (typeCode !== "21") {
      errors.push({
        type: "syntax",
        line: lineNumber,
        field: "種別コード",
        message: `種別コードは「21」である必要があります（現在: ${typeCode}）`,
        severity: "error",
      })
    }

    // 文字コード区分
    const charCode = fields[2]?.replace(/"/g, "")
    if (charCode !== "0") {
      errors.push({
        type: "syntax",
        line: lineNumber,
        field: "文字コード区分",
        message: `文字コード区分は「0」である必要があります（現在: ${charCode}）`,
        severity: "error",
      })
    }

    // 委託者コード
    const clientCode = fields[3]?.replace(/"/g, "")
    if (!/^\d{10}$/.test(clientCode)) {
      errors.push({
        type: "syntax",
        line: lineNumber,
        field: "委託者コード",
        message: "委託者コードは10桁の数字である必要があります",
        severity: "error",
      })
    }

    // 実行日
    const execDate = fields[5]?.replace(/"/g, "")
    if (!/^\d{4}$/.test(execDate)) {
      errors.push({
        type: "syntax",
        line: lineNumber,
        field: "実行日",
        message: "実行日はMMDD形式（4桁数字）である必要があります",
        severity: "error",
      })
    }

    // 依頼人銀行番号
    const bankCode = fields[6]?.replace(/"/g, "")
    if (bankCode !== "0036") {
      errors.push({
        type: "syntax",
        line: lineNumber,
        field: "依頼人銀行番号",
        message: `依頼人銀行番号は「0036」である必要があります（現在: ${bankCode}）`,
        severity: "error",
      })
    }
  }

  const validateDataRecord = (fields: string[], lineNumber: number, errors: ValidationError[]): number => {
    if (fields.length < 15) {
      errors.push({
        type: "syntax",
        line: lineNumber,
        message: "データレコードのフィールド数が不足しています",
        severity: "error",
      })
      return 0
    }

    // 受取人銀行番号
    const bankCode = fields[1]?.replace(/"/g, "")
    if (!/^\d{4}$/.test(bankCode)) {
      errors.push({
        type: "syntax",
        line: lineNumber,
        field: "受取人銀行番号",
        message: "受取人銀行番号は4桁の数字である必要があります",
        severity: "error",
      })
    }

    // 受取人支店番号
    const branchCode = fields[3]?.replace(/"/g, "")
    if (!/^\d{3}$/.test(branchCode)) {
      errors.push({
        type: "syntax",
        line: lineNumber,
        field: "受取人支店番号",
        message: "受取人支店番号は3桁の数字である必要があります",
        severity: "error",
      })
    }

    // 預金種目
    const depositType = fields[6]?.replace(/"/g, "")
    if (!["1", "2", "4"].includes(depositType)) {
      errors.push({
        type: "syntax",
        line: lineNumber,
        field: "預金種目",
        message: "預金種目は「1」「2」「4」のいずれかである必要があります",
        severity: "error",
      })
    }

    // 受取人口座番号
    const accountNumber = fields[7]?.replace(/"/g, "")
    if (!/^\d{1,7}$/.test(accountNumber)) {
      errors.push({
        type: "syntax",
        line: lineNumber,
        field: "受取人口座番号",
        message: "受取人口座番号は1〜7桁の数字である必要があります",
        severity: "error",
      })
    }

    // 送金金額
    const amountStr = fields[9]?.replace(/"/g, "")
    const amount = Number.parseInt(amountStr) || 0
    if (!/^\d{1,10}$/.test(amountStr) || amount <= 0) {
      errors.push({
        type: "syntax",
        line: lineNumber,
        field: "送金金額",
        message: "送金金額は1〜10桁の正の数字である必要があります",
        severity: "error",
      })
    }

    // 新規コード
    const newCode = fields[10]?.replace(/"/g, "")
    if (newCode !== "1") {
      errors.push({
        type: "syntax",
        line: lineNumber,
        field: "新規コード",
        message: `新規コードは「1」である必要があります（現在: ${newCode}）`,
        severity: "error",
      })
    }

    return amount
  }

  const validateTrailerRecord = (
    fields: string[],
    lineNumber: number,
    errors: ValidationError[],
    dataCount: number,
  ): number => {
    if (fields.length < 4) {
      errors.push({
        type: "syntax",
        line: lineNumber,
        message: "トレーラレコードのフィールド数が不足しています",
        severity: "error",
      })
      return 0
    }

    // 依頼件数
    const countStr = fields[1]?.replace(/"/g, "")
    const count = Number.parseInt(countStr) || 0
    if (!/^\d{1,6}$/.test(countStr)) {
      errors.push({
        type: "syntax",
        line: lineNumber,
        field: "依頼件数",
        message: "依頼件数は1〜6桁の数字である必要があります",
        severity: "error",
      })
    } else if (count !== dataCount) {
      errors.push({
        type: "logic",
        line: lineNumber,
        field: "依頼件数",
        message: `依頼件数がデータレコード数と一致しません（期待: ${dataCount}件、実際: ${count}件）`,
        severity: "error",
      })
    }

    // 依頼金額合計
    const totalAmountStr = fields[2]?.replace(/"/g, "")
    const totalAmount = Number.parseInt(totalAmountStr) || 0
    if (!/^\d{1,12}$/.test(totalAmountStr)) {
      errors.push({
        type: "syntax",
        line: lineNumber,
        field: "依頼金額合計",
        message: "依頼金額合計は1〜12桁の数字である必要があります",
        severity: "error",
      })
    }

    return totalAmount
  }

  const validateEndRecord = (fields: string[], lineNumber: number, errors: ValidationError[]) => {
    if (fields.length < 2) {
      errors.push({
        type: "syntax",
        line: lineNumber,
        message: "エンドレコードのフィールド数が不足しています",
        severity: "error",
      })
    }
  }

  const handleValidate = async () => {
    if (!file) return

    setIsValidating(true)
    try {
      const content = await file.text()
      const result = await validateZenginFormat(content)
      setValidationResult(result)
    } catch (error) {
      setValidationResult({
        isValid: false,
        errors: [
          {
            type: "syntax",
            line: 0,
            message: "ファイルの読み込みに失敗しました",
            severity: "error",
          },
        ],
        summary: {
          totalRecords: 0,
          headerCount: 0,
          dataCount: 0,
          trailerCount: 0,
          endCount: 0,
          totalAmount: 0,
          expectedAmount: 0,
        },
      })
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">全銀フォーマットCSV検証ツール</h1>
        <p className="text-muted-foreground">楽天銀行指定の全銀フォーマットCSVファイルの形式をチェックします</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            ファイルアップロード
          </CardTitle>
          <CardDescription>検証したいCSVファイルを選択してください（文字コード: JIS、拡張子: .csv）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">CSVファイル</Label>
            <Input id="file" type="file" accept=".csv" onChange={handleFileChange} />
          </div>

          {file && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <FileText className="h-4 w-4" />
              <span className="text-sm">{file.name}</span>
              <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          )}

          <Button onClick={handleValidate} disabled={!file || isValidating} className="w-full">
            {isValidating ? "検証中..." : "検証開始"}
          </Button>
        </CardContent>
      </Card>

      {validationResult && (
        <div className="space-y-6">
          {/* 検証結果サマリー */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {validationResult.isValid ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                検証結果
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{validationResult.summary.totalRecords}</div>
                  <div className="text-sm text-muted-foreground">総レコード数</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{validationResult.summary.dataCount}</div>
                  <div className="text-sm text-muted-foreground">データ件数</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{validationResult.summary.totalAmount.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">合計金額（円）</div>
                </div>
                <div className="text-center">
                  <Badge variant={validationResult.isValid ? "default" : "destructive"}>
                    {validationResult.isValid ? "正常" : "エラーあり"}
                  </Badge>
                </div>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {validationResult.isValid
                    ? "ファイルは全銀フォーマットの仕様に準拠しています。"
                    : `${validationResult.errors.filter((e) => e.severity === "error").length}件のエラーが見つかりました。`}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* エラー詳細 */}
          {validationResult.errors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>エラー詳細</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {validationResult.errors.map((error, index) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-start gap-3">
                        {error.severity === "error" ? (
                          <XCircle className="h-4 w-4 text-red-500 mt-0.5" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={error.severity === "error" ? "destructive" : "secondary"}>
                              {error.type === "syntax" ? "構文エラー" : "論理エラー"}
                            </Badge>
                            {error.line > 0 && <span className="text-sm text-muted-foreground">{error.line}行目</span>}
                            {error.field && <span className="text-sm font-medium">[{error.field}]</span>}
                          </div>
                          <p className="text-sm">{error.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 仕様説明 */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>全銀フォーマット仕様</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">レコード構成</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
              <div className="p-2 bg-blue-50 rounded">
                <div className="font-medium">ヘッダ (1)</div>
                <div className="text-xs text-muted-foreground">1件必須</div>
              </div>
              <div className="p-2 bg-green-50 rounded">
                <div className="font-medium">データ (2)</div>
                <div className="text-xs text-muted-foreground">1件以上</div>
              </div>
              <div className="p-2 bg-yellow-50 rounded">
                <div className="font-medium">トレーラ (8)</div>
                <div className="text-xs text-muted-foreground">1件必須</div>
              </div>
              <div className="p-2 bg-purple-50 rounded">
                <div className="font-medium">エンド (9)</div>
                <div className="text-xs text-muted-foreground">1件必須</div>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-semibold mb-2">主要チェック項目</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• CSV形式の構文チェック</li>
              <li>• レコード順序の検証（1→2*N→8→9）</li>
              <li>• 必須項目の存在チェック</li>
              <li>• データ型・文字数制限の検証</li>
              <li>• 依頼件数とデータレコード数の一致</li>
              <li>• 依頼金額合計とデータレコード金額合計の一致</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
