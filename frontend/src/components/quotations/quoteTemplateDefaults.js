import { COMPANY_BANK_ACCOUNTS, COMPANY_NAME } from '../../config/branding';

/** Himachal tour quotation template defaults */

export const QUOTE_WELCOME_TEXT = `Greetings from ${COMPANY_NAME}. Your journey surely deserves warm hospitality, comfortable stay, hassle-free transportation and proper guidance which ${COMPANY_NAME}, a reliable and growing travel organization, promises to cater at the best possible rates.

We are proud to offer packages that can't be more perfect and take you to such an enhanced experience that the only words you have for us are "True to their Commitment."

So, let our executives assist you 24/7 and create magical moments just for you.`;

/** Policies aligned to HindHolidays Policies & Terms PDF */
export const QUOTE_POLICIES = {
  remarks: [
    'Rates are subject to change without prior notice until the booking is confirmed.',
    'Accommodation will be provided in the mentioned hotel or a similar hotel, subject to availability.',
    'Hotel and other services are subject to availability until the required advance payment is received.',
    'Taxes are included as applicable.',
    'Extra bed refers to an extra mattress.',
    'Heater charges, where applicable, are payable directly at the hotel.',
    'Air conditioning (AC) may not operate in certain hill stations due to local conditions.',
    'Rates may vary during festive periods and special dates such as Independence Day, Holi, Diwali, Christmas and New Year.',
    "No refund will be provided for unused services due to weather conditions, health issues, strikes, roadblocks, government restrictions or other unforeseen circumstances beyond the company's control.",
  ],
  confirmation: [
    '40% advance is required to confirm the booking.',
    'If you do not wish to pay 40% at once, you may lock the package by paying a 25% token amount. The token amount is non-refundable.',
    'The remaining 15% must be paid at least 7 days before the travel date to complete the 40% advance.',
    'If the total 40% advance is not cleared before the travel date, hotel and other services will be subject to availability and may be changed accordingly.',
    'The remaining 60% payment must be cleared on arrival at the destination.',
  ],
  cancellation: [
    'More than 30 days before the travel date: 25% of the total package cost will be charged.',
    '16 to 30 days before the travel date: 35% of the total package cost will be charged.',
    '10 to 15 days before the travel date: 50% of the total package cost will be charged.',
    'Within 7 days of the travel date or after the start of the trip: 100% of the total package cost will be charged.',
  ],
  amendment: [
    'Requests to postpone or prepone the travel date must be communicated to HindHolidays in writing at least 15 days before the scheduled travel date.',
    'One date change may be permitted without an amendment charge when requested at least 15 days before the travel date, subject to availability.',
    'Any charges imposed by hotels, transporters or other service providers for the date change will be payable by the client or adjusted from the amount already paid.',
    'All postponed/preponed bookings are subject to availability and applicable seasonal/festival rates. Any difference in package cost due to revised dates will be payable by the client.',
    'No postponement or preponement request will normally be accepted within 15 days of the travel date, except where special consideration is possible due to circumstances such as natural calamities, strikes or other exceptional situations.',
    'The amount paid for a postponed/preponed booking will remain valid for 2 years from the date of the original payment and may be adjusted against a future tour with HindHolidays, subject to the applicable terms and availability.',
    'The booking may be transferred to a friend or relative upon request, subject to availability and compliance with the applicable terms and conditions.',
    'Cancellation of a booking will be governed separately by the Cancellation Policy above. Postponement/preponement is not considered a cancellation when processed under this policy.',
  ],
  terms: [
    "Room allocation is subject to the hotel's discretion at the time of check-in within the booked room category.",
    'No refund will be provided for unused accommodation, meals, transportation, sightseeing or other services.',
    "Hotel services and amenities are subject to the hotel's policies and operating conditions. Any service-related concern will be handled with the concerned service provider on a case-by-case basis.",
    "In case of unforeseen circumstances beyond the company's control, the company will assist the client in making reasonable alternative arrangements, subject to availability and applicable additional costs.",
  ],
};

/** Fallback when package catalog has no inclusions/exclusions */
export const QUOTE_DEFAULT_INCLUSIONS = [
  'Accommodation as per the itinerary (or similar category hotel).',
  'Meals as mentioned in the day-wise plan (MAP / as selected).',
  'Exclusive cab transfers as per the itinerary.',
  'Airport / railway station / hotel pick-up and drop as applicable.',
  'Driver allowances, tolls, parking and applicable green/luxury taxes.',
  'Assistance on arrival.',
  'All applicable taxes as included in the package fare.',
];

export const QUOTE_DEFAULT_EXCLUSIONS = [
  'Anything not mentioned under inclusions.',
  'Air fare / train fare.',
  'Monument entry fees, camera charges and guide fees.',
  'Heater charges (payable directly at the hotel, where applicable).',
  'Meals other than those specified in the itinerary.',
  'Personal expenses such as laundry, tips, telephone and beverages.',
  'Any expense arising due to natural calamities, landslides, strikes or roadblocks.',
];

export const QUOTE_BANK_ACCOUNTS = COMPANY_BANK_ACCOUNTS;

export const PACKAGE_CATEGORY_LABELS = {
  luxury: 'Deluxe',
  family: 'Deluxe',
  honeymoon: 'Premium',
  group: 'Standard',
  adventure: 'Standard',
  corporate: 'Corporate',
  budget: 'Budget',
};

export function getPackageCategoryLabel(type) {
  return PACKAGE_CATEGORY_LABELS[type] || 'Deluxe';
}
