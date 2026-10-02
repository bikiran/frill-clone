// Industry choices for a new workspace (signup + admin "create company"), and
// the mapping from a Google Places category to one of them.

export const INDUSTRIES = [
  'Retail', 'E-commerce', 'Food & Drink', 'Pets & Aquarium', 'Beauty & Wellness',
  'Fitness & Sport', 'Healthcare', 'Trades & Home Services', 'Automotive',
  'Professional Services', 'Education', 'Finance', 'Real Estate',
  'Travel & Hospitality', 'Media & Entertainment', 'Logistics', 'Manufacturing',
  'SaaS', 'Other',
] as const

export type Industry = (typeof INDUSTRIES)[number]

// Google Places (New) place types → industry. Exact types first; the suffix
// rules below catch the long tail ("thai_restaurant", "hardware_store", …).
const EXACT: Record<string, Industry> = {}
const add = (industry: Industry, types: string) => { for (const t of types.split(/\s+/)) if (t) EXACT[t] = industry }

add('Pets & Aquarium', 'pet_store veterinary_care aquarium pet_boarding_service pet_care dog_park')
add('Food & Drink', 'restaurant cafe coffee_shop bakery bar pub wine_bar food food_court meal_takeaway meal_delivery ice_cream_shop dessert_shop juice_shop tea_house deli sandwich_shop donut_shop bagel_shop candy_store chocolate_shop confectionery catering_service brewery winery night_club')
add('Beauty & Wellness', 'beauty_salon hair_salon hair_care barber_shop nail_salon spa massage beautician makeup_artist skin_care_clinic tanning_studio wellness_center sauna')
add('Fitness & Sport', 'gym fitness_center yoga_studio sports_club sports_complex sports_coaching swimming_pool golf_course stadium')
add('Healthcare', 'doctor dentist dental_clinic hospital pharmacy drugstore physiotherapist chiropractor medical_lab medical_clinic health')
add('Trades & Home Services', 'plumber electrician roofing_contractor painter locksmith general_contractor laundry cleaning_service landscaping_service hvac_contractor')
add('Automotive', 'car_repair car_dealer car_wash car_rental auto_parts_store gas_station tire_shop electric_vehicle_charging_station')
add('Professional Services', 'lawyer accounting consultant insurance_agency marketing_agency employment_agency funeral_home photographer')
add('Education', 'school primary_school secondary_school university preschool library child_care_agency tutoring_service driving_school')
add('Finance', 'bank atm finance')
add('Real Estate', 'real_estate_agency')
add('Travel & Hospitality', 'lodging hotel motel hostel resort_hotel bed_and_breakfast guest_house campground travel_agency tourist_attraction tour_agency')
add('Media & Entertainment', 'movie_theater event_venue amusement_park art_gallery museum bowling_alley concert_hall performing_arts_theater casino')
add('Logistics', 'moving_company courier_service storage post_office')
add('Retail', 'store shopping_mall supermarket grocery_store convenience_store florist market department_store')

function fromType(t: string): Industry | null {
  if (EXACT[t]) return EXACT[t]
  if (t.endsWith('_restaurant')) return 'Food & Drink'
  if (t.endsWith('_store') || t.endsWith('_shop')) return 'Retail'
  return null
}

/** Best industry for a Google place, from its primaryType then its other types. */
export function industryFromGoogle(primaryType?: string, types?: string[]): Industry | null {
  for (const t of [primaryType, ...(types || [])]) {
    if (!t) continue
    const hit = fromType(t)
    if (hit) return hit
  }
  return null
}
