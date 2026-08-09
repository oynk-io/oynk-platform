export const validationCopy = {
  firstName: "Enter your first name.",
  lastName: "Enter your last name.",
  email: "Enter a valid work email address.",
  phone: "Enter a valid international phone number.",
  legalName: "Enter the legal name registered for your business.",
  registrationCountry: "Select the country where the business is registered.",
  operatingCountry: "Select your primary operating country.",
  password: "Use at least 12 characters, including uppercase, lowercase, and a number.",
  confirmPassword: "Passwords do not match.",
  acceptedTerms: "You must accept the terms and privacy notice to continue.",
  otp: "Enter the complete six-digit verification code.",
  requiredPassword: "Enter your password.",
  form: "Check the highlighted information before continuing.",
  network: "We couldn’t connect to Oynk. Check your connection and try again.",
  server: "We couldn’t complete this request. Try again, or contact support if the problem continues.",
} as const;

export const fieldLabels: Record<string,string> = {
  firstName:"First name",lastName:"Last name",email:"Work email",phone:"Phone number",
  legalName:"Legal business name",tradingName:"Trading name",registrationCountry:"Registration country",
  operatingCountry:"Primary operating country",operatingCountries:"Operating countries",password:"Password",
  confirmPassword:"Password confirmation",acceptedTerms:"Terms and privacy notice",code:"Verification code",
};
