/**
 * Export options of LibreOffice (property `FilterData`), for PDF, PNG and JPG.
 *
 * Only the options listed here are accepted, with the type and the range of values. These options come from the user, they are sent to
 * LibreOffice by the converter. Names are the ones of LibreOffice:
 * https://wiki.documentfoundation.org/Macros/Python_Guide/PDF_export_filter_data
 */

const BOOLEAN = { type : 'boolean' };

function integer (min, max) {
  return { type : 'integer', min : min, max : max };
}

function enumeration (values) {
  return { type : 'enum', values : values };
}

function string (maxLength, pattern) {
  return { type : 'string', maxLength : maxLength, pattern : pattern };
}

const PDF = {
  // images
  ReduceImageResolution                  : BOOLEAN,
  MaxImageResolution                     : enumeration([75, 150, 300, 600, 1200]),
  UseLosslessCompression                 : BOOLEAN,
  Quality                                : integer(1, 100),
  // version and accessibility. 1: PDF/A-1b, 2: PDF/A-2b, 3: PDF/A-3b, 15: PDF 1.5, 16: PDF 1.6, 17: PDF 1.7
  SelectPdfVersion                       : enumeration([0, 1, 2, 3, 15, 16, 17]),
  UseTaggedPDF                           : BOOLEAN,
  PDFUACompliance                        : BOOLEAN,
  // security
  EncryptFile                            : BOOLEAN,
  DocumentOpenPassword                   : string(128),
  RestrictPermissions                    : BOOLEAN,
  PermissionPassword                     : string(128),
  // 0: not allowed, 1: low resolution, 2: high resolution
  Printing                               : integer(0, 2),
  // 0: not allowed, 1: insert, delete, rotate pages, 2: fill form fields, 3: comment, 4: any except extracting pages
  Changes                                : integer(0, 4),
  EnableCopyingOfContent                 : BOOLEAN,
  EnableTextAccessForAccessibilityTools  : BOOLEAN,
  // watermark
  Watermark                              : string(500),
  WatermarkColor                         : integer(0, 16777215),
  WatermarkFontHeight                    : integer(1, 500),
  WatermarkRotateAngle                   : integer(0, 3600),
  WatermarkFontName                      : string(100),
  // content
  PageRange                              : string(100, /^[0-9,\-\s]+$/),
  ExportBookmarks                        : BOOLEAN,
  OpenBookmarkLevels                     : integer(-1, 10),
  ExportNotes                            : BOOLEAN,
  ExportFormFields                       : BOOLEAN,
  AllowDuplicateFieldNames               : BOOLEAN,
  FormsType                              : integer(0, 3),
  SinglePageSheets                       : BOOLEAN,
  ExportHiddenSlides                     : BOOLEAN,
  // viewer
  InitialView                            : integer(0, 2),
  DisplayPDFDocumentTitle                : BOOLEAN,
  HideViewerToolbar                      : BOOLEAN,
  HideViewerMenubar                      : BOOLEAN,
  HideViewerWindowControls               : BOOLEAN,
  FitWindow                              : BOOLEAN,
  CenterWindow                           : BOOLEAN,
  OpenInFullScreenMode                   : BOOLEAN
};

const PNG = {
  Compression : integer(0, 9),
  Interlaced  : integer(0, 1),
  PixelWidth  : integer(1, 10000),
  PixelHeight : integer(1, 10000)
};

const JPG = {
  Quality     : integer(1, 100),
  ColorMode   : integer(0, 1),
  PixelWidth  : integer(1, 10000),
  PixelHeight : integer(1, 10000)
};

const FORMATS = { pdf : PDF, png : PNG, jpg : JPG };

function checkValue (name, value, rule) {
  switch (rule.type) {
    case 'boolean':
      return typeof value === 'boolean' ? null : 'The option "' + name + '" must be true or false';
    case 'integer':
      return (Number.isInteger(value) && value >= rule.min && value <= rule.max) ? null : 'The option "' + name + '" must be an integer between ' + rule.min + ' and ' + rule.max;
    case 'enum':
      return rule.values.indexOf(value) !== -1 ? null : 'The option "' + name + '" must be one of: ' + rule.values.join(', ');
    default:
      if (typeof value !== 'string' || value.length > rule.maxLength) {
        return 'The option "' + name + '" must be a text of ' + rule.maxLength + ' characters at most';
      }
      if (rule.pattern && rule.pattern.test(value) === false) {
        return 'The option "' + name + '" contains forbidden characters';
      }
      return null;
  }
}

var filters = {

  FORMATS,

  /**
   * Check the export options coming from the user
   *
   * @param  {String} extension  pdf, png or jpg
   * @param  {Object} options    options of the user. null and undefined values are ignored
   * @return {Object}            { error : String|null, filters : Object }, where `filters` contains a copy of the accepted options
   */
  check : function (extension, options) {
    var _rules = FORMATS[extension];
    var _result = {};
    if (options === null || options === undefined) {
      return { error : null, filters : _result };
    }
    if (typeof options !== 'object' || options instanceof Array) {
      return { error : 'formatOptions must be an object, for the format "' + extension + '"', filters : _result };
    }
    var _names = Object.keys(options);
    for (var i = 0; i < _names.length; i++) {
      var _name = _names[i];
      if (options[_name] === null || options[_name] === undefined) {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(_rules, _name) === false) {
        return { error : 'Unknown option "' + _name + '" for the format "' + extension + '". Available options: ' + Object.keys(_rules).join(', '), filters : {} };
      }
      var _error = checkValue(_name, options[_name], _rules[_name]);
      if (_error !== null) {
        return { error : _error, filters : {} };
      }
      _result[_name] = options[_name];
    }
    if (_result.EncryptFile === true && !_result.DocumentOpenPassword) {
      return { error : 'The option "EncryptFile" needs the option "DocumentOpenPassword"', filters : {} };
    }
    if (_result.RestrictPermissions === true && !_result.PermissionPassword) {
      return { error : 'The option "RestrictPermissions" needs the option "PermissionPassword"', filters : {} };
    }
    return { error : null, filters : _result };
  }
};

module.exports = filters;
