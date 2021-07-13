import Layout from '@components/layout/Layout'
import UserContext, { UserTeam } from '@context/UserContext'
import React, { useContext, useEffect, useState } from 'react'
import CraftTeam from '@components/craft_team/CraftTeam'
// import { updateUserTeam } from '@common/actions/userAPIActions'
import { v4 as uuidv4 } from 'uuid'
import ImageHandler from '@common/actions/getImages'
import Split from '@components/split/Split'
import { TabPanel } from '@reach/tabs'
import style from './style.module.scss'
import classnames from 'classnames'
import { TeamMember } from '@adibkhan/pogo-web-backend'
import Loader from 'react-loader-spinner'
import TeamContext, { defaultTeam } from '@context/TeamContext'
import {
  getPokemonData,
  getValidateTeam,
  getRandomPokemon,
} from '@common/actions/pokemonAPIActions'
import getCP, { BaseStatsProps } from '@common/actions/getCP'
import ErrorPopup from '@components/error_popup/ErrorPopup'
import ImportTeam from '@components/import_team/ImportTeam'
import calculateStats from '@common/actions/calculateStats'
import LanguageContext from '@context/LanguageContext'
import SettingsContext from '@context/SettingsContext'

interface TeamExportProps {
  speciesId: string
  name?: string
  chargeMoves: string[]
  fastMove: string
  level: number
  iv: {
    atk: number
    def: number
    hp: number
  }
  shiny?: boolean
}

interface ContentProps {
  meta: string
  switchMeta: (m: string) => void
}

interface ButtonProps {
  title: string
  onClick: () => void
  className: string
}

const Content: React.FC<ContentProps> = ({ meta, switchMeta }) => {
  const { user, setTeams } = useContext(UserContext)
  const [isCrafting, setIsCrafting] = useState(false)
  const [teamToEdit, setTeamToEdit] = useState<UserTeam | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRandomTeamLoading, setIsRandomTeamLoading] = useState(false)
  const [isImportingTeam, setIsImportingTeam] = useState(false)
  const imagesHandler = new ImageHandler()
  const { team, setTeam } = useContext(TeamContext)
  const [importString, setImportString] = useState('')
  const [popup, setPopup] = useState('')
  const [error, setError] = useState('')
  const [popupTitle, setPopupTitle] = useState('')
  const [popupButtons, setPopupButtons] = useState(
    undefined as ButtonProps[] | undefined
  )
  const [isImportLoading, setIsImportLoading] = useState(false)

  const strings = useContext(LanguageContext).strings
  const language = useContext(SettingsContext).language

  useEffect(() => {
    setIsLoading(false)
  }, [teamToEdit])

  const updateTeam = (newteam: UserTeam) => {
    if (newteam.id) {
      const editIndex = user.teams.findIndex((x) => x.id === newteam.id)
      if (editIndex > -1) {
        user.teams[editIndex] = newteam
      } else {
        user.teams.push(newteam)
      }

      if (team && team.id === newteam.id) {
        setTeam(newteam)
      }

      setTeams(user.teams)
    }
  }

  /**
   * Adds a Random Team to the userTeams
   */
  async function handleOnClickAddRandomTeam() {
    setIsRandomTeamLoading(true)

    const data = await getRandomPokemon(meta, language)
    if (data === undefined) {
      alert('An unexpected error occured')
      return
    } else if (data instanceof Error) {
      alert(data.message)
      return
    }

    const members = data

    setIsRandomTeamLoading(false)

    updateTeam({
      name: Math.random().toString(36).substring(7),
      id: Math.random().toString(36).substring(7),
      format: meta,
      members,
    })
  }

  async function loadTeam(t: UserTeam) {
    if (!t || !t.members || !t.format || !t.name) {
      throw new Error()
    }
    return Promise.all(
      t.members.map(async (x) => {
        const p = await getPokemonData(x.speciesId, 'norestrictions')
        const bs = p.baseStats as BaseStatsProps
        const cp = getCP(bs, [x.level, x.iv.atk, x.iv.def, x.iv.hp])
        const stats = calculateStats(bs, x.level, x.iv.atk, x.iv.def, x.iv.hp)
        const m = {
          speciesId: x.speciesId,
          name: x.name,
          chargeMoves: x.chargeMoves,
          fastMove: x.fastMove,
          level: x.level,
          iv: x.iv,
          shiny: x.shiny,
          speciesName: p.speciesName,
          cp,
          types: p.types,
          sid: p.sid,
          hp: stats.hp,
          atk: stats.atk,
          def: stats.def,
          baseStats: bs,
        }
        return m
      })
    )
  }

  async function handleImportTeam() {
    setIsImportLoading(true)
    try {
      const parsedImport = await JSON.parse(importString)
      loadTeam(parsedImport).then(async (members) => {
        const result = await getValidateTeam(
          JSON.stringify(members),
          parsedImport.format,
          language
        )
        if (result.message) {
          setError(result.message)
          setPopupTitle(strings.invalid_team)
          setPopupButtons(undefined)
        } else {
          updateTeam({
            name: parsedImport.name,
            id: uuidv4(),
            format: parsedImport.format,
            members,
          })
          if (parsedImport.format !== meta) {
            switchMeta(parsedImport.format)
          }
          setIsImportingTeam(false)
        }
        setIsImportLoading(false)
      })
    } catch (error) {
      setError(strings.invalid_team_object)
      setPopupTitle(strings.invalid_team)
      setPopupButtons(undefined)
      setIsImportLoading(false)
      return
    }
  }

  const handleOnClickAddTeam = () => {
    setTeamToEdit(null)
    setIsCrafting(true)
  }

  const startTeamImport = () => {
    setIsImportingTeam(true)
    setImportString('')
  }

  const cancelTeamImport = () => {
    setIsImportingTeam(false)
  }

  const handleImportChange = (event: any) => {
    setImportString(event.target.value)
  }

  const formatTeam = (t: UserTeam): string => {
    const members = t.members.map((x) => {
      const s: TeamExportProps = {
        speciesId: x.speciesId,
        name: x.name,
        chargeMoves: x.chargeMoves,
        fastMove: x.fastMove,
        level: x.level,
        iv: x.iv,
        shiny: x.shiny,
      }
      return s
    })
    const d = {
      name: t.name,
      format: t.format,
      members,
    }
    return JSON.stringify(d)
  }

  const handleExport = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    const teamToExport = user.teams[parseInt(e.currentTarget.value, 10)]
    navigator.clipboard.writeText(formatTeam(teamToExport))
    setPopup(strings.team_copied_succes)
  }

  const handleEditTeam = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => {
    const i = parseInt(e.currentTarget.value, 10)
    setTeamToEdit(user.teams[i])
    if (teamToEdit === null) {
      setIsLoading(true)
    }
    setIsCrafting(true)
  }

  const onExit = () => {
    setIsCrafting(false)
  }

  const onPopupClose = () => {
    setPopup('')
  }

  const onErrorPopupClose = () => {
    setError('')
  }

  const handleDelete = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    if (window.confirm(strings.confirm_team_delete)) {
      const i = parseInt(e.currentTarget.value, 10)

      if (team && team.id === user.teams[i].id) {
        setTeam(defaultTeam)
      }

      user.teams.splice(i, 1)
      setTeams(user.teams)
    }
  }

  if (isLoading) {
    return <Loader type="TailSpin" color="#68BFF5" height={80} width={80} />
  }

  if (!user || !user.teams) {
    return <p>{strings.teambuilder_signin}</p>
  }

  if (isCrafting) {
    return (
      <div className={style.root}>
        {teamToEdit ? (
          <CraftTeam
            selectedMeta={meta}
            updateTeam={updateTeam}
            teamToEdit={teamToEdit}
            onExit={onExit}
          />
        ) : (
          <CraftTeam
            selectedMeta={meta}
            updateTeam={updateTeam}
            onExit={onExit}
          />
        )}
      </div>
    )
  }

  return (
    <div className={style.root}>
      {!!popup && (
        <ErrorPopup
          title={popup}
          error={' '}
          onClose={onPopupClose}
          buttons={undefined}
        />
      )}
      {!!error && (
        <ErrorPopup
          error={error}
          title={popupTitle}
          onClose={onErrorPopupClose}
          buttons={popupButtons}
        />
      )}
      {user.teams.length > 0 ? (
        user.teams.map((userTeam: UserTeam, i: number) => {
          if (userTeam.format === meta) {
            return (
              <div className={style.wrapper} key={userTeam.id}>
                <button
                  className={style.box}
                  value={i}
                  onClick={handleEditTeam}
                >
                  <label className={style.label}>{userTeam.name}</label>
                  <div className={style.members}>
                    {userTeam.members.length > 0 &&
                      userTeam.members.map(
                        (member: TeamMember, index: number) => (
                          <img
                            key={index}
                            src={imagesHandler.getMini(member.sid)}
                            alt={member.speciesName}
                          />
                        )
                      )}
                  </div>
                </button>
                <div className={style.btns}>
                  <button
                    value={i}
                    onClick={handleDelete}
                    className={classnames([style.btn, style.delete])}
                  >
                    {strings.delete}
                  </button>
                  <button
                    value={i}
                    onClick={handleExport}
                    className={classnames([style.btn, style.edit])}
                  >
                    {strings.export}
                  </button>
                </div>
              </div>
            )
          }
        })
      ) : (
        <p>{strings.no_teams_display}</p>
      )}
      <div className={style.addButtons}>
        <button className="btn btn-primary" onClick={handleOnClickAddTeam}>
          {strings.add_team}
        </button>
        {isRandomTeamLoading ? (
          <Loader type="TailSpin" color="#68BFF5" height={30} width={30} />
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleOnClickAddRandomTeam}
          >
            {strings.add_random_team}
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={startTeamImport}
          style={{ visibility: isImportingTeam ? 'hidden' : 'visible' }}
        >
          {strings.import_team}
        </button>
      </div>

      <ImportTeam
        visible={isImportingTeam}
        importString={importString}
        saveImportString={handleImportChange}
        cancelImport={cancelTeamImport}
        confirmImport={handleImportTeam}
        isLoading={isImportLoading}
      />
    </div>
  )
}

const TeamPage = () => {
  // const { user } = useContext(UserContext)
  const [metas] = useState([
    'Great League',
    '2021 Continentals',
    'Atlantis Field',
    'Specialist Cup',
    'Nursery Cup',
    'Cliffhanger',
    'MainSeries Cup',
    'Ultra League',
    'Master League',
  ])
  const [index, setIndex] = useState(0)

  // useEffect(() => {
  //   if (user && metas) {
  //     const metaArr: string[] = [
  //       'Great League',
  //       'Ultra League',
  //       'Master League',
  //     ]
  //     user.teams.forEach((team: any) => {
  //       if (!metaArr.some((m) => m === team.meta)) metaArr.push(team.meta)
  //     })
  //   }
  // }, [user, metas])

  // const addMeta = () => {
  //   // open modal and add custom meta to list
  //   // eventually these metas and their rules should be stored on backend, useEffect to store them in state
  //   // they should also be part of the user object
  //   const newMetas = [...metas, 'Holiday Cup']
  //   setMetas(newMetas)
  //   setIndex(newMetas.length - 1) // will be whatever the new meta is
  //   // reset select value on close/submit of modal
  // }

  const switchMeta = (m: string) => {
    const i = metas.findIndex((x) => x === m)
    if (i > -1) {
      setIndex(i)
    }
  }

  const onChange = (i: number) => {
    setIndex(i)
  }

  const tabs = metas.map((x) => (
    <TabPanel key={x}>
      <Content meta={x} switchMeta={switchMeta} />
    </TabPanel>
  ))

  return (
    <Layout>
      <Split
        tabs={metas}
        // buttonProps={{ title: "New Meta", onClick: addMeta }}
        tabProps={{ index, onChange, children: null }}
      >
        {tabs}
      </Split>
    </Layout>
  )
}

export default TeamPage
