/**
 * Confirmed `BarcodeConfig` vocabulary for Newland Web Kiosk 2.21.
 *
 * Code IDs are the exact, case-sensitive strings the native decoder looks up.
 * There is no normalization: `CODABAR` and `CODEBAR` are different keys, and
 * lower-case or "prettier" spellings will not match.
 *
 * The scanner engine chooses one of two tables. Table A (`EngineSettingCodeEN`)
 * is the common set; Table B (`EngineSettingCode_Industry2EN`) ships with the
 * Industrial 2 engine. Which one is active cannot be read from the page, so
 * callers must use the spelling that matches their engine.
 *
 * Note that `QR` is the native config key. `QRCODE` is the *result* name for
 * barcode type `258` and is not accepted here.
 *
 * Only the code-ID and property vocabulary is shipped. The full per-engine
 * tables (defaults, enums and per-symbology property subsets) are proprietary
 * and stay out of this repository.
 */

/** Table A: `EngineSettingCodeEN` — 48 code IDs. */
export const BARCODE_CODE_IDS_TABLE_A = [
  "Common1D",
  "CODE128",
  "UCCEAN128",
  "AIM128",
  "ISBT128",
  "EAN8",
  "EAN13",
  "ISSN",
  "ISBN",
  "UPCE",
  "UPCA",
  "ITF",
  "ITF6",
  "ITF14",
  "DP14",
  "DP12",
  "COOP25",
  "MATRIX25",
  "IND25",
  "STD25",
  "CODE39",
  "CODABAR",
  "CODE93",
  "CODE11",
  "CODE49",
  "CODE16K",
  "PLSY",
  "MSIPLSY",
  "RSS",
  "COMPOSITE",
  "PDF417",
  "QR",
  "AZTEC",
  "DM",
  "DM_ECS129",
  "MAXIC",
  "CSC",
  "MICROPDF",
  "MICROQR",
  "USERC",
  "GM",
  "DOTCODE",
  "CENTERDECODE",
  "AppIdSeparator",
  "MultiDecode",
  "OTHER",
  "OCR",
  "OCR-AI",
] as const;

/** Table B: `EngineSettingCode_Industry2EN` — 50 code IDs. */
export const BARCODE_CODE_IDS_TABLE_B = [
  "CODE128",
  "SETUP128",
  "UCCEAN128",
  "AIM128",
  "ISBT128",
  "EAN8",
  "EAN13",
  "ISSN",
  "ISBN",
  "UPCE",
  "UPCA",
  "ITF",
  "ITF6",
  "ITF14",
  "DP14",
  "DP12",
  "COOP25",
  "MATRIX25",
  "IND25",
  "STD25",
  "CODE39",
  // Table B spells Codabar with an E; table A uses `CODABAR`.
  "CODEBAR",
  "CODE93",
  "CODE11",
  "CODE49",
  "CODE16K",
  "PLSY",
  "MSIPLSY",
  "RSS",
  "COMPOSITE",
  // Table B's name for table A's `Common1D` group.
  "_1D_COMMON",
  "PDF417",
  "QR",
  "AZTEC",
  "DM",
  "DM_ECS129",
  "MAXIC",
  "CSC",
  "MICROPDF",
  "MICROQR",
  "USERC",
  "GM",
  "DOTCODE",
  "CENTERDECODE",
  "AppIdSeparator",
  "MultiDecode",
  "ILLUM",
  "PrePro",
  "ExposureSet",
  "OTHER",
] as const;

export type BarcodeCodeIdTableA = (typeof BARCODE_CODE_IDS_TABLE_A)[number];
export type BarcodeCodeIdTableB = (typeof BARCODE_CODE_IDS_TABLE_B)[number];

/**
 * A known code ID, or any other string. The `string & {}` branch keeps
 * autocomplete for known IDs while allowing IDs this library has not listed.
 */
export type BarcodeCodeId =
  | BarcodeCodeIdTableA
  | BarcodeCodeIdTableB
  | (string & {});

/**
 * Every property key used by either table, deduplicated and sorted.
 *
 * Spellings are exact, including the table's own typos (`TrsmtChkChar`,
 * `TrsmtStasrtStop`, `MsgtoEan13`, `Micor`, `RectAngle`). Do not "fix" them:
 * the native lookup compares the literal string.
 */
export const BARCODE_PROPERTIES = [
  "AFStep",
  "AIMIDoutput",
  "AIOCREnable",
  "AccuracyMode",
  "AddPadcode",
  "Addon2Required",
  "Addon5Required",
  "AddonRequired",
  "AutoFocus",
  "AutoFocusZoom",
  "BitCode32Prech",
  "CHNIDCheck",
  "CHNIDEnable",
  "Check",
  "ChkMode",
  "CloseECI",
  "ClosePreamble",
  "CloseSysChar",
  "Code32SpecEdit",
  "Code32TrsmtChkChar",
  "Code32TrsmtStasrtStop",
  "CodeNum",
  "CombinationCode2D",
  "CombinationCodeMIN",
  "CompareCodeType",
  "Coupon",
  "CtrdecLevel",
  "CtrdecVaule",
  "DecodeAll",
  "DelayInitSensor",
  "Denoise",
  "DifficultyLevel",
  "Digit2",
  "Digit5",
  "DotFram",
  "ECC200",
  "EXPTELEnable",
  "EXPTELWITH1DEnable",
  "Ecc0To140",
  "EnECI",
  "Enable",
  "Esc129",
  "ExposureLevel",
  "ExposureMaxTime",
  "ExposureMinTime",
  "ExposurePolicy",
  "FPRIDCheck",
  "FPRIDEnable",
  "Fnc1",
  "FullAscii",
  "Gain",
  "Gs1Coupon",
  "HKIDCheck",
  "HKIDEnable",
  "HKMACAOMTPCheck",
  "HKMACAOMTPEnable",
  "HKMACAOTWPassCheck",
  "HKMACAOTWPassEnable",
  "HandLuma",
  "HorizontalCtrDec",
  "IllumColor",
  "IllumInterval",
  "IllumMode",
  "JanForBook",
  "Length",
  "Length8",
  "Lottery",
  "Lumi",
  "MACAOIDCheck",
  "MACAOIDEnable",
  "MainFrame",
  "MaxBarcodeNum",
  "Maxlen",
  "Method1",
  "Method2",
  "Method3",
  "Method4",
  "Method5",
  "Method6",
  "Method7",
  "Method8",
  "Micor",
  "Micro",
  "Minlen",
  "Mirror",
  "Mobile",
  "Model1",
  "Model2",
  "MsgToupca",
  "MsgtoEan13",
  "NumFixed",
  "OCRPVIenable",
  "OV13855ExposureLevel",
  "Onqrspec",
  "OutputMode",
  "PassportCheck",
  "PassportEnable",
  "QuietZone",
  "RectAngle",
  "ReqCoupon",
  "SetupEnable",
  "SleepTimeSwitch",
  "StartStopMode",
  "TD1Check",
  "TD1Enable",
  "TD2Check",
  "TD2Enable",
  "TLC39",
  "TRSMTSYSDIGIT",
  "TRSMTUSCode",
  "TWMTPCheck",
  "TWMTPEnable",
  "Tdoupca",
  "TrsmtAi",
  "TrsmtChkChar",
  "TrsmtStasrtStop",
  "TypeToupca",
  "TypetoEan13",
  "UpcEan",
  "Uscode",
  "Value1",
  "Value2",
  "Value3",
  "Value4",
  "Value5",
  "Value6",
  "Value7",
  "Value8",
  "VerifyTimes",
  "VideoMode",
  "VisaACheck",
  "VisaAEnable",
  "VisaBCheck",
  "VisaBEnable",
  "WebSite",
  "WorkMode",
] as const;

/**
 * A known property, or any other string. The `string & {}` branch keeps
 * autocomplete for known properties while allowing undocumented ones.
 */
export type BarcodeProperty =
  | (typeof BARCODE_PROPERTIES)[number]
  | (string & {});

/**
 * Every value crosses the bridge as a string. Boolean-style settings use "0"
 * and "1"; lengths and counts use decimal strings; enum settings use the
 * indexes the engine defines. The receiver rejects empty strings, so there is
 * no way to clear a setting through this API.
 */
export const BARCODE_ENABLED = "1";
export const BARCODE_DISABLED = "0";
