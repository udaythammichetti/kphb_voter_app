import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Shell from './components/Shell'
import { LocaleProvider } from './context/Locale'
import { VoterDataProvider } from './context/VoterData'
import Consolidated from './pages/Consolidated'
import Dashboard from './pages/Dashboard'
import Families from './pages/Families'
import FamilyDetail from './pages/FamilyDetail'
import PartDetail from './pages/PartDetail'
import Parts from './pages/Parts'
import SectionDetail from './pages/SectionDetail'
import Voters from './pages/Voters'
import './App.css'

export default function App() {
  return (
    <LocaleProvider>
      <VoterDataProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Dashboard />} />
              <Route path="voters" element={<Voters />} />
              <Route path="parts" element={<Parts />} />
              <Route path="parts/:partId" element={<PartDetail />} />
              <Route path="parts/:partId/sections/:sectionId" element={<SectionDetail />} />
              <Route path="families" element={<Families />} />
              <Route path="families/:familyId" element={<FamilyDetail />} />
              <Route path="consolidated" element={<Consolidated />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </VoterDataProvider>
    </LocaleProvider>
  )
}
