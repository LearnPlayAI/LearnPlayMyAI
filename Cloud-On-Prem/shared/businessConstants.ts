export interface DepartmentWithUnits {
  id: string;
  name: string;
  description: string;
  units: string[];
}

export const BUSINESS_DEPARTMENTS: DepartmentWithUnits[] = [
  {
    id: 'general',
    name: 'General',
    description: 'Organization-wide content accessible to all learners',
    units: [
      'Company Culture',
      'Safety & Compliance',
      'General Knowledge',
      'Onboarding',
      'Ethics & Values',
      'Communication Skills',
      'Wellness & Health',
    ],
  },
  {
    id: 'finance',
    name: 'Finance',
    description: 'Financial management and accounting',
    units: [
      'Accounts Payable',
      'Accounts Receivable',
      'Payroll',
      'Budgeting & Forecasting',
      'Financial Reporting',
      'Tax & Compliance',
      'Treasury Management',
    ],
  },
  {
    id: 'sales',
    name: 'Sales',
    description: 'Revenue generation and customer acquisition',
    units: [
      'Business Development',
      'Account Management',
      'Sales Operations',
      'Inside Sales',
      'Field Sales',
      'Channel Sales',
      'Sales Enablement',
    ],
  },
  {
    id: 'it',
    name: 'IT',
    description: 'Information technology and systems',
    units: [
      'Security Awareness',
      'Infrastructure',
      'Software Development',
      'Cloud Services',
      'Help Desk & Support',
      'Data Management',
      'Network Administration',
    ],
  },
  {
    id: 'hr',
    name: 'HR',
    description: 'Human resources and people operations',
    units: [
      'Recruitment & Onboarding',
      'Training & Development',
      'Compliance & Policy',
      'Employee Relations',
      'Compensation & Benefits',
      'Performance Management',
      'Talent Management',
    ],
  },
  {
    id: 'management',
    name: 'Management',
    description: 'Leadership and strategic planning',
    units: [
      'Project Management',
      'Strategic Planning',
      'Change Management',
      'Business Analysis',
      'Quality Assurance',
      'Risk Management',
      'Innovation & Growth',
    ],
  },
  {
    id: 'operations',
    name: 'Operations',
    description: 'Operational excellence and execution',
    units: [
      'Supply Chain',
      'Quality Control',
      'Logistics & Distribution',
      'Process Improvement',
      'Facilities Management',
      'Inventory Management',
      'Vendor Management',
    ],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    description: 'Brand and customer engagement',
    units: [
      'Digital Marketing',
      'Content Marketing',
      'Brand Management',
      'Market Research',
      'Product Marketing',
      'Event Marketing',
      'Customer Experience',
    ],
  },
  {
    id: 'customer-success',
    name: 'Customer Success',
    description: 'Customer support and satisfaction',
    units: [
      'Customer Support',
      'Technical Support',
      'Customer Onboarding',
      'Account Health',
      'Renewal Management',
      'Customer Training',
      'Success Analytics',
    ],
  },
];

export function getDepartmentById(id: string): DepartmentWithUnits | undefined {
  return BUSINESS_DEPARTMENTS.find((dept) => dept.id === id);
}

export function getDepartmentByName(name: string): DepartmentWithUnits | undefined {
  return BUSINESS_DEPARTMENTS.find((dept) => dept.name === name);
}
