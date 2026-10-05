import { afterEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({load:vi.fn().mockResolvedValue({}),context:vi.fn()}));
vi.mock('@/lib/auth/context',()=>({requireFinanceContext:mocks.context}));
vi.mock('@/features/finance-accounts/data/finance-account-activity',()=>({getFinanceAccountActivity:mocks.load}));
vi.mock('@/features/finance-accounts/components/finance-account-activity-screen',()=>({FinanceAccountActivityScreen:()=>null}));
import Page from './page';
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
it.each([['Asia/Phnom_Penh','2027-01-01','2027-01-01'],['UTC','2026-12-01','2026-12-31']])('defaults account activity to the authorized %s company period',async(timeZone,start,end)=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-12-31T17:00:00Z'));
  mocks.context.mockResolvedValue({organizationId:'synthetic-company',operationalTimezone:timeZone});
  await Page({params:Promise.resolve({accountId:'synthetic-account'}),searchParams:Promise.resolve({})});
  expect(mocks.load).toHaveBeenCalledWith('synthetic-company','synthetic-account',{periodStart:start,periodEnd:end});
});
it('preserves an explicitly selected backdated account period',async()=>{
  mocks.context.mockResolvedValue({organizationId:'synthetic-company',operationalTimezone:'Asia/Phnom_Penh'});
  await Page({params:Promise.resolve({accountId:'synthetic-account'}),searchParams:Promise.resolve({from:'2025-01-01',to:'2025-01-31'})});
  expect(mocks.load).toHaveBeenCalledWith('synthetic-company','synthetic-account',{periodStart:'2025-01-01',periodEnd:'2025-01-31'});
});
