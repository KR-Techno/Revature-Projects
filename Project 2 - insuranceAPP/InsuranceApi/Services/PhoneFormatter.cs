/* Uses libphonenumber-C# package to parse through phone numbers and format them properly.
 * This is used in the RegisterController to validate and format phone numbers before saving them to the database.
 * The TryFormat method takes a string input and returns a formatted phone number if valid, or false if invalid.
 * It uses the PhoneNumberUtil class from the package to parse and validate the phone number.
 * The formatted phone number is returned in international format with hyphens instead of spaces.
 * The method also checks that the formatted phone number fits within the varchar(20) column in the database.
 */
using PhoneNumbers;

namespace InsuranceApi.Services;

public static class PhoneFormatter
{
    private static readonly PhoneNumberUtil Util = PhoneNumberUtil.GetInstance();

    public static bool TryFormat(string input, out string formatted)
    {
        formatted = "";
        try
        {
            // a number typed without a country code is treated as US/Canada (+1)
            var number = Util.Parse(input, "US");
            if (!Util.IsValidNumber(number)) return false;

            // international format looks like "+1 516-555-0101"; swap spaces for hyphens
            formatted = Util.Format(number, PhoneNumberFormat.INTERNATIONAL).Replace(' ', '-');

            return formatted.Length <= 20;   // must fit the varchar(20) column
        }
        catch (NumberParseException)
        {
            return false;
        }
    }
}