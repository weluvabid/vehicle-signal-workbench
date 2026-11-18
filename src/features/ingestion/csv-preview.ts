/** Read only the first non-empty CSV row; never materialize the full file for inspection. */
export async function inspectCsvHeaders(file: File): Promise<string[]> {
  const { default: Papa } = await import('papaparse');
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      preview: 1,
      skipEmptyLines: 'greedy',
      complete: (result) => {
        if (result.errors.length > 0 || result.data.length === 0) {
          reject(new Error('Could not read a CSV header row.'));
          return;
        }
        resolve(result.data[0].map((value) => value.trim()));
      },
      error: reject,
    });
  });
}
