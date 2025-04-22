/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// PDF date string utility implementation
let pdfDateStringRegex;

class PDFDateString {
  static toDateObject(input) {
    if (!input || typeof input !== "string") {
      return null;
    }

    // Use a regular expression to parse the PDF date string format
    if (!pdfDateStringRegex) {
      pdfDateStringRegex = new RegExp(
        "^D:" +
          "(\\d{4})" +
          "(\\d{2})?" +
          "(\\d{2})?" +
          "(\\d{2})?" +
          "(\\d{2})?" +
          "(\\d{2})?" +
          "([Z|+|-])?" +
          "(\\d{2})?" +
          "'?" +
          "(\\d{2})?" +
          "'?"
      );
    }

    // Match the input date string
    const matches = pdfDateStringRegex.exec(input);
    if (!matches) {
      return null;
    }

    // Parse the date components
    const year = parseInt(matches[1], 10);
    let month = parseInt(matches[2], 10);
    month = month >= 1 && month <= 12 ? month - 1 : 0;
    let day = parseInt(matches[3], 10);
    day = day >= 1 && day <= 31 ? day : 1;
    let hour = parseInt(matches[4], 10);
    hour = hour >= 0 && hour <= 23 ? hour : 0;
    let minute = parseInt(matches[5], 10);
    minute = minute >= 0 && minute <= 59 ? minute : 0;
    let second = parseInt(matches[6], 10);
    second = second >= 0 && second <= 59 ? second : 0;

    const universalTimeRelation = matches[7] || "Z";
    let offsetHour = parseInt(matches[8], 10);
    offsetHour = offsetHour >= 0 && offsetHour <= 23 ? offsetHour : 0;
    let offsetMinute = parseInt(matches[9], 10) || 0;
    offsetMinute = offsetMinute >= 0 && offsetMinute <= 59 ? offsetMinute : 0;

    // Handle timezone offset
    if (universalTimeRelation === "-") {
      hour += offsetHour;
      minute += offsetMinute;
    } else if (universalTimeRelation === "+") {
      hour -= offsetHour;
      minute -= offsetMinute;
    }

    // Create and return a JavaScript Date object
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }
}

export { PDFDateString };