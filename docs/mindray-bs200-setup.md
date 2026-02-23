# Mindray BS-200 HL7 Interface Setup

This document provides setup instructions and API formats for integrating the Mindray BS-200 Chemistry Analyzer via HL7 v2.3.1.

## API Field Formats

When submitting orders to the `/api/worklist` endpoint, ensure the following field formats are strictly adhered to for HL7 compliance:

### 1. Date/Time Fields
Fields representing dates or times MUST use the HL7 `YYYYMMDDHHMMSS` format.
- `birth_date`: e.g., `19850824000000` (August 24, 1985)
- `sample_time`: e.g., `20240224143000` (February 24, 2024, 14:30:00)

### 2. Test Names Format
The `test_names` field supports a pipe-delimited format to include additional metadata (Unit and Normal Range) for each test.
- **Format:** `TestName|Unit|NormalRange`
- **Multiple Tests:** Separate multiple tests with commas.
- **Example:** `Glucose|mg/dL|70-100, Creatinine|mg/dL|0.6-1.2`

If Unit and Normal Range are not available, you can just provide the test name (e.g., `Glucose, Creatinine`).

### 3. Other Specific Fields
- `stat_flag`: Must be `Y` (Yes) or `N` (No). Defaults to `N`.
- `blood_type`: Should be standard ABO/Rh values (e.g., `O`, `A`, `B`, `AB`). Avoid using `A+`, `O-`, etc., unless specifically supported by your analyzer configuration.
- `sex`: `M` (Male), `F` (Female), or `O` (Other).

## Equipment Configuration

To ensure proper communication between the LIS and the Mindray BS-200 analyzer:

1. **Network Setup:**
   - Ensure the analyzer and the LIS server are on the same network.
   - Configure the analyzer's HL7 settings to point to the LIS server's IP address and the configured port (default is often `8080` or `5000`, check your specific equipment setup in the UI).

2. **HL7 Settings on Analyzer:**
   - **Protocol:** TCP/IP
   - **Message Format:** HL7 v2.3.1
   - **Encoding:** ASCII / Latin-1
   - **Query Mode:** Ensure the analyzer is set to query the LIS for sample information (if bidirectional communication is desired).

3. **QC Results:**
   - The LIS automatically detects QC results based on `MSH-16 = 2`.
   - QC Level (High/Medium/Low) is extracted from `OBR-17`.
   - QC Lot Number is extracted from `OBR-14`. Ensure the analyzer is configured to send these fields correctly for QC samples.
