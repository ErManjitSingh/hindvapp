/**
 * Seed HR demo data — employees, attendance, leaves, recruitment, payroll.
 * Safe to re-run (upserts by demo email).
 * Run: node src/scripts/seedHrDemo.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const User = require('../models/User');
const Role = require('../models/Role');
const Branch = require('../models/Branch');
const Attendance = require('../models/Attendance');
const HrDepartment = require('../models/hr/HrDepartment');
const HrDesignation = require('../models/hr/HrDesignation');
const HrEmployee = require('../models/hr/HrEmployee');
const HrLeaveRequest = require('../models/hr/HrLeaveRequest');
const HrHoliday = require('../models/hr/HrHoliday');
const HrJobOpening = require('../models/hr/HrJobOpening');
const HrCandidate = require('../models/hr/HrCandidate');
const HrInterview = require('../models/hr/HrInterview');
const HrPayrollRun = require('../models/hr/HrPayrollRun');

const PASSWORD = process.env.SEED_PASSWORD || '123456';
const DEMO_MARKER = 'hr.demo.rohit@travelcrm.local';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function monthsAgo(months, day = 15) {
  const d = new Date();
  d.setDate(day);
  d.setHours(12, 0, 0, 0);
  d.setMonth(d.getMonth() - months);
  return d;
}

function birthdayOn(dayOffsetYears = 28) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - dayOffsetYears);
  return d;
}

function anniversaryYearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d;
}

async function mapDepartments() {
  const rows = await HrDepartment.find({ isDeleted: { $ne: true } }).lean();
  return Object.fromEntries(rows.map((r) => [r.name.toLowerCase(), r]));
}

async function mapDesignations() {
  const rows = await HrDesignation.find({ isDeleted: { $ne: true } })
    .populate('departmentId', 'name')
    .lean();
  const map = {};
  for (const r of rows) {
    const dept = r.departmentId?.name?.toLowerCase() || 'any';
    map[`${dept}:${r.name.toLowerCase()}`] = r;
    map[r.name.toLowerCase()] = r;
  }
  return map;
}

function des(map, dept, name) {
  return map[`${dept.toLowerCase()}:${name.toLowerCase()}`]?._id || map[name.toLowerCase()]?._id || null;
}

async function upsertDemoUser({ email, name, branchId, roleId }) {
  let user = await User.findOne({ email });
  if (user) {
    user.name = name;
    user.branchId = branchId;
    if (roleId) user.roleId = roleId;
    await user.save();
    return user;
  }
  return User.create({
    name,
    email,
    password: PASSWORD,
    role: 'sales_executive',
    roleId,
    department: 'Sales',
    branchId,
    status: 'active',
  });
}

async function upsertEmployee(payload) {
  let emp = await HrEmployee.findOne({ email: payload.email, isDeleted: { $ne: true } });
  if (emp) {
    Object.assign(emp, payload);
    await emp.save();
    return emp;
  }
  return HrEmployee.create(payload);
}

async function ensureTodayAttendance(userId, branchId, status = 'present') {
  const day = startOfDay();
  const checkIn = new Date(day);
  checkIn.setHours(9, 15, 0, 0);
  await Attendance.findOneAndUpdate(
    { userId, date: day },
    {
      userId,
      branchId,
      date: day,
      checkIn,
      checkOut: status === 'present' ? new Date(day.getTime() + 9 * 60 * 60 * 1000) : null,
      totalHours: status === 'present' ? 9 : null,
      workMode: 'office',
      status,
    },
    { upsert: true, new: true }
  );
}

async function seedHrDemo() {
  await connectDB();

  const branch = await Branch.findOne({ status: 'active' }).sort({ createdAt: 1 });
  if (!branch) throw new Error('No active branch found — run main seed first');

  const execRole = await Role.findOne({ slug: 'sales_executive' });
  const hrAdmin = await User.findOne({ email: 'hr@example.com' });

  const deptMap = await mapDepartments();
  const desMap = await mapDesignations();

  const today = startOfDay();
  const employeeDefs = [
    {
      firstName: 'Rohit',
      lastName: 'Kumar',
      email: DEMO_MARKER,
      phone: '9876500001',
      department: 'Sales',
      designation: 'Sales Executive',
      salary: 32000,
      joiningDate: monthsAgo(2, 10),
      dateOfBirth: birthdayOn(29),
      gender: 'male',
      withUser: true,
      present: true,
    },
    {
      firstName: 'Priya',
      lastName: 'Sharma',
      email: 'hr.demo.priya@travelcrm.local',
      phone: '9876500002',
      department: 'Sales',
      designation: 'Team Leader',
      salary: 45000,
      joiningDate: monthsAgo(5, 5),
      dateOfBirth: birthdayOn(32),
      gender: 'female',
      withUser: true,
      present: true,
    },
    {
      firstName: 'Amit',
      lastName: 'Singh',
      email: 'hr.demo.amit@travelcrm.local',
      phone: '9876500003',
      department: 'Operations',
      designation: 'Operations Executive',
      salary: 38000,
      joiningDate: monthsAgo(4, 18),
      dateOfBirth: birthdayOn(27),
      gender: 'male',
      withUser: true,
      present: true,
      onLeaveToday: true,
    },
    {
      firstName: 'Sneha',
      lastName: 'Iyer',
      email: 'hr.demo.sneha@travelcrm.local',
      phone: '9876500004',
      department: 'Accounts',
      designation: 'Accountant',
      salary: 35000,
      joiningDate: monthsAgo(3, 22),
      dateOfBirth: birthdayOn(26),
      gender: 'female',
      withUser: true,
      present: true,
    },
    {
      firstName: 'Ankit',
      lastName: 'Patel',
      email: 'hr.demo.ankit@travelcrm.local',
      phone: '9876500005',
      department: 'IT',
      designation: 'Software Engineer',
      salary: 52000,
      joiningDate: monthsAgo(1, 8),
      dateOfBirth: birthdayOn(30),
      gender: 'male',
      withUser: true,
      present: false,
    },
    {
      firstName: 'Kavita',
      lastName: 'Rana',
      email: 'hr.demo.kavita@travelcrm.local',
      phone: '9876500006',
      department: 'HR',
      designation: 'HR Executive',
      salary: 34000,
      joiningDate: anniversaryYearsAgo(3),
      dateOfBirth: birthdayOn(31),
      gender: 'female',
      withUser: true,
      present: true,
    },
    {
      firstName: 'Rajesh',
      lastName: 'Mehta',
      email: 'hr.demo.rajesh@travelcrm.local',
      phone: '9876500007',
      department: 'Sales',
      designation: 'Sales Manager',
      salary: 65000,
      joiningDate: monthsAgo(6, 12),
      dateOfBirth: birthdayOn(38),
      gender: 'male',
      withUser: false,
      present: false,
    },
    {
      firstName: 'Deepak',
      lastName: 'Verma',
      email: 'hr.demo.deepak@travelcrm.local',
      phone: '9876500008',
      department: 'Operations',
      designation: 'Operations Manager',
      salary: 58000,
      joiningDate: anniversaryYearsAgo(2),
      dateOfBirth: birthdayOn(35),
      gender: 'male',
      withUser: false,
      present: false,
      onLeaveToday: true,
    },
  ];

  const employees = [];
  for (const def of employeeDefs) {
    const dept = deptMap[def.department.toLowerCase()];
    let userId = null;
    if (def.withUser && execRole) {
      const user = await upsertDemoUser({
        email: def.email,
        name: `${def.firstName} ${def.lastName}`,
        branchId: branch._id,
        roleId: execRole._id,
      });
      userId = user._id;
      if (def.present && !def.onLeaveToday) {
        await ensureTodayAttendance(userId, branch._id, 'present');
      }
    }

    const emp = await upsertEmployee({
      firstName: def.firstName,
      lastName: def.lastName,
      email: def.email,
      phone: def.phone,
      gender: def.gender,
      dateOfBirth: def.dateOfBirth,
      joiningDate: def.joiningDate,
      departmentId: dept?._id || null,
      designationId: des(desMap, def.department, def.designation),
      employmentType: 'full_time',
      status: 'active',
      shift: 'General',
      workLocation: 'Shimla Office',
      salary: def.salary,
      branchId: branch._id,
      userId,
      createdBy: hrAdmin?._id || null,
    });
    employees.push({ emp, def });
  }

  const byEmail = Object.fromEntries(employees.map((e) => [e.emp.email, e.emp]));

  // Reporting manager — Priya leads Rohit
  if (byEmail[DEMO_MARKER] && byEmail['hr.demo.priya@travelcrm.local']) {
    byEmail[DEMO_MARKER].reportingManagerId = byEmail['hr.demo.priya@travelcrm.local']._id;
    await byEmail[DEMO_MARKER].save();
  }

  // Leaves
  const leaveDefs = [
    {
      email: DEMO_MARKER,
      leaveType: 'casual',
      fromDate: daysFromNow(3),
      toDate: daysFromNow(4),
      days: 2,
      reason: 'Family function',
      status: 'pending',
    },
    {
      email: 'hr.demo.sneha@travelcrm.local',
      leaveType: 'sick',
      fromDate: daysFromNow(1),
      toDate: daysFromNow(1),
      days: 1,
      reason: 'Medical appointment',
      status: 'pending',
    },
    {
      email: 'hr.demo.ankit@travelcrm.local',
      leaveType: 'earned',
      fromDate: daysFromNow(5),
      toDate: daysFromNow(7),
      days: 3,
      reason: 'Personal travel',
      status: 'pending',
    },
    {
      email: 'hr.demo.amit@travelcrm.local',
      leaveType: 'casual',
      fromDate: today,
      toDate: today,
      days: 1,
      reason: 'On leave today',
      status: 'approved',
    },
    {
      email: 'hr.demo.deepak@travelcrm.local',
      leaveType: 'earned',
      fromDate: today,
      toDate: daysFromNow(1),
      days: 2,
      reason: 'Approved leave',
      status: 'approved',
    },
  ];

  for (const lv of leaveDefs) {
    const emp = byEmail[lv.email];
    if (!emp) continue;
    const existing = await HrLeaveRequest.findOne({
      employeeId: emp._id,
      fromDate: startOfDay(lv.fromDate),
      isDeleted: { $ne: true },
    });
    if (existing) continue;
    await HrLeaveRequest.create({
      employeeId: emp._id,
      branchId: branch._id,
      leaveType: lv.leaveType,
      fromDate: startOfDay(lv.fromDate),
      toDate: endOfDay(lv.toDate),
      days: lv.days,
      reason: lv.reason,
      status: lv.status,
    });
  }

  // Holidays
  const holidayDefs = [
    { name: 'Independence Day', date: new Date(today.getFullYear(), 7, 15), type: 'national' },
    { name: 'Diwali', date: daysFromNow(45), type: 'festival' },
    { name: 'Company Foundation Day', date: daysFromNow(20), type: 'company' },
  ];
  for (const h of holidayDefs) {
    const day = startOfDay(h.date);
    await HrHoliday.findOneAndUpdate(
      { name: h.name, date: day, isDeleted: { $ne: true } },
      { name: h.name, date: day, type: h.type, description: `${h.name} — company holiday` },
      { upsert: true, new: true }
    );
  }

  // Recruitment flow
  const salesDept = deptMap.sales?._id;
  const itDept = deptMap.it?._id;
  const jobFrontend = await HrJobOpening.findOneAndUpdate(
    { title: 'Frontend Developer', isDeleted: { $ne: true } },
    {
      title: 'Frontend Developer',
      departmentId: itDept,
      designationId: des(desMap, 'IT', 'Software Engineer'),
      openings: 2,
      location: 'Shimla / Remote',
      employmentType: 'full_time',
      description: 'React developer for HindHolidays',
      status: 'open',
      createdBy: hrAdmin?._id,
    },
    { upsert: true, new: true }
  );
  const jobSales = await HrJobOpening.findOneAndUpdate(
    { title: 'Sales Executive', isDeleted: { $ne: true } },
    {
      title: 'Sales Executive',
      departmentId: salesDept,
      designationId: des(desMap, 'Sales', 'Sales Executive'),
      openings: 3,
      location: 'Shimla',
      employmentType: 'full_time',
      description: 'Travel sales executive for domestic packages',
      status: 'open',
      createdBy: hrAdmin?._id,
    },
    { upsert: true, new: true }
  );

  const candidateDefs = [
    {
      job: jobFrontend,
      firstName: 'Arjun',
      lastName: 'Malhotra',
      email: 'demo.candidate.arjun@travelcrm.local',
      phone: '9876510001',
      stage: 'interview',
      round: 'Tech Round',
      daysAhead: 2,
      hour: 11,
    },
    {
      job: jobSales,
      firstName: 'Neha',
      lastName: 'Gupta',
      email: 'demo.candidate.neha@travelcrm.local',
      phone: '9876510002',
      stage: 'interview',
      round: 'HR Round',
      daysAhead: 3,
      hour: 14,
    },
    {
      job: jobFrontend,
      firstName: 'Vikram',
      lastName: 'Joshi',
      email: 'demo.candidate.vikram@travelcrm.local',
      phone: '9876510003',
      stage: 'interview',
      round: 'Final Round',
      daysAhead: 5,
      hour: 16,
    },
  ];

  for (const c of candidateDefs) {
    let candidate = await HrCandidate.findOne({ email: c.email, isDeleted: { $ne: true } });
    if (!candidate) {
      candidate = await HrCandidate.create({
        jobOpeningId: c.job._id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        source: 'linkedin',
        stage: c.stage,
        experienceYears: 3,
        expectedCtc: 600000,
      });
    }

    const scheduledAt = daysFromNow(c.daysAhead);
    scheduledAt.setHours(c.hour, 0, 0, 0);

    const ivExists = await HrInterview.findOne({
      candidateId: candidate._id,
      isDeleted: { $ne: true },
      status: 'scheduled',
    });
    if (!ivExists) {
      await HrInterview.create({
        candidateId: candidate._id,
        jobOpeningId: c.job._id,
        round: c.round,
        scheduledAt,
        interviewer: 'HR Team',
        mode: 'video',
        status: 'scheduled',
        createdBy: hrAdmin?._id,
      });
    }
  }

  // Payroll — current month
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  const slips = employees.map(({ emp, def }) => ({
    employeeId: emp._id,
    employeeCode: emp.employeeCode || '',
    name: `${def.firstName} ${def.lastName}`,
    department: def.department,
    designation: def.designation,
    basic: Math.round(def.salary * 0.5),
    allowances: Math.round(def.salary * 0.3),
    bonuses: 0,
    incentives: Math.round(def.salary * 0.05),
    deductions: Math.round(def.salary * 0.05),
    tax: Math.round(def.salary * 0.05),
    pf: Math.round(def.salary * 0.12),
    esic: 0,
    advance: 0,
    loans: 0,
    gross: def.salary,
    net: Math.round(def.salary * 0.82),
  }));
  const totals = slips.reduce(
    (acc, s) => ({
      employees: acc.employees + 1,
      gross: acc.gross + s.gross,
      deductions: acc.deductions + s.deductions + s.tax + s.pf,
      net: acc.net + s.net,
    }),
    { employees: 0, gross: 0, deductions: 0, net: 0 }
  );

  await HrPayrollRun.findOneAndUpdate(
    { month, year, isDeleted: { $ne: true } },
    {
      month,
      year,
      status: 'processed',
      slips,
      totals,
      processedAt: new Date(today.getFullYear(), today.getMonth(), 5),
      processedBy: hrAdmin?._id,
      notes: 'Demo payroll run',
    },
    { upsert: true, new: true }
  );

  console.log('\n✅ HR demo data seeded.\n');
  console.log(`Employees: ${employees.length}`);
  console.log('Departments: Sales, Accounts, Operations, IT, HR');
  console.log('Includes: attendance, leaves, holidays, interviews, payroll');
  console.log('\nDemo employee logins (for attendance, password 123456):');
  employeeDefs.filter((e) => e.withUser).forEach((e) => {
    console.log(`  ${e.email}`);
  });
  console.log('\nHR Portal: /hr/login — hr@example.com / 123456\n');

  await mongoose.disconnect();
}

seedHrDemo().catch((err) => {
  console.error(err);
  process.exit(1);
});
