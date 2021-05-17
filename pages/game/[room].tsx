import Status from '@components/game/status/Status'
import SocketContext from '@context/SocketContext'
import { useRouter } from 'next/router'
import { useContext, useEffect, useState } from 'react'
import {
  Anim,
  TeamMember,
  ResolveTurnPayload,
  Move,
  Room,
} from '@adibkhan/pogo-web-backend'
import { CODE, Actions } from '@adibkhan/pogo-web-backend/actions'
import { Icon } from '@components/icon/Icon'
import style from './style.module.scss'
import Field from '@components/game/field/Field'
import { CharacterProps } from '@components/game/field/Character'
import Switch from '@components/game/switch/Switch'
import Popover from '@components/game/popover/Popover'
import Charged from '@components/game/charged/Charged'
import axios from 'axios'
import { SERVER } from '@config/index'
import IdContext from '@context/IdContext'
import Shield from '@components/game/shield/Shield'
import Stepper from '@components/game/stepper/Stepper'
import useKeyPress from '@common/actions/useKeyPress'
import SettingsContext from '@context/SettingsContext'
import useWindowSize from '@common/actions/useWindowSize'
import Loader from 'react-loader-spinner'
import getKeyDescription from '@common/actions/getKeyDescription'

interface CheckPayload {
  countdown: number
}

interface InitPayload {
  allMoves: Move[][]
  current: TeamMember[]
}

interface Data {
  type: keyof typeof CODE
  payload?: CheckPayload | ResolveTurnPayload | InitPayload
}

enum StatusTypes {
  STARTING,
  MAIN,
  WAITING,
  FAINT,
  CHARGE,
  SHIELD,
  ANIMATING,
}

const GamePage = () => {
  const router = useRouter()
  const { room } = router.query
  const ws: WebSocket = useContext(SocketContext).socket
  const id: string = useContext(IdContext).id
  const { showKeys, keys } = useContext(SettingsContext)
  const {
    fastKey,
    charge1Key,
    charge2Key,
    switch1Key,
    switch2Key,
    shieldKey,
  } = keys
  const { height } = useWindowSize()
  const [active, setActive] = useState([] as TeamMember[])
  const [opponent, setOpponent] = useState([] as TeamMember[])
  const [characters, setCharacters] = useState([{ back: true }, {}] as [
    CharacterProps,
    CharacterProps
  ])
  const [charPointer, setCharPointer] = useState(0)
  const [time, setTime] = useState(240)
  const [swap, setSwap] = useState(0)
  const [currentMove, setCurrentMove] = useState('')
  const [bufferedMove, setBufferedMove] = useState('')
  const [shields, setShields] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [oppShields, setOppShields] = useState(0)
  const [oppRemaining, setOppRemaining] = useState(0)
  const [wait, setWait] = useState(-1)
  const [status, setStatus] = useState(StatusTypes.STARTING)
  const [moves, setMoves] = useState([] as Move[][])
  const [isLoading, setIsLoading] = useState(true)
  const [chargeMult, setChargeMult] = useState(0.25)
  const [toShield, setToShield] = useState(false)
  const [message, setMessage] = useState('')
  // const [currentType, setCurrentType] = useState('') TODO: Make this work on both perspectives

  const initGame = (payload: InitPayload) => {
    setMoves(payload.allMoves)
    setActive(payload.current)
  }

  const startGame = () => {
    setTime(240)
    setMessage('GO!')
    setStatus(StatusTypes.MAIN)
  }

  const endGame = (result: string) => {
    ws.onclose = null
    if (ws.close) {
      ws.close()
    }
    router.push(`/end/${room}?result=${result}`)
  }

  const onTurn = (payload: ResolveTurnPayload) => {
    if (payload.update[0] !== null && payload.update[0].id === id) {
      const hp = payload.update[0]!.hp
      const isActive = payload.update[0].active
      const energy = payload.update[0]!.energy
      const isShields = payload.update[0].shields
      setActive((prev1) => {
        setCharPointer((prev2) => {
          setCharacters((prev3b) => {
            const prev3 = { ...prev3b }
            setCurrentMove(() => {
              let p = ''
              setBufferedMove((prev) => {
                p = prev
                return ''
              })
              return p
            })
            if (hp !== undefined) {
              prev1[isActive].current!.hp = hp
            }
            if (energy) {
              prev1[isActive].current!.energy = energy
            }
            prev3[0].char = prev1[isActive]
            if (isShields) {
              setShields(isShields)
            }
            if (payload.update[0]?.remaining !== undefined) {
              setRemaining(payload.update[0]!.remaining)
              prev1[isActive].current!.hp = 0
              if (isActive === prev2) {
                setTimeout((_) => setStatus(StatusTypes.FAINT), 3000)
                prev3[0].anim = {
                  type: 'faint',
                  turn: payload.turn,
                }
              }
            }
            if (payload.update[0]?.charge) {
              if (payload.update[0].charge === 1) {
                setStatus(StatusTypes.CHARGE)
              } else {
                setStatus(StatusTypes.SHIELD)
              }
            }
            return prev3
          })
          return isActive
        })
        return prev1
      })
      if (payload.update[0].message) {
        setMessage(payload.update[0].message)
      }
      if (payload.update[0]?.wait) {
        setWait(payload.update[0]!.wait)
        if (payload.update[0]!.wait <= -1) {
          setStatus((prev) => {
            if (
              payload.update[1] &&
              payload.update[1].wait &&
              payload.update[1].wait <= -1
            ) {
              if (prev === StatusTypes.CHARGE) {
                setChargeMult(0.25)
                setTimeout(() => {
                  setStatus((currentStatus) => {
                    if (currentStatus === StatusTypes.ANIMATING) {
                      return StatusTypes.MAIN
                    }
                    return currentStatus
                  })
                }, 3000)
                return StatusTypes.ANIMATING
              } else if (prev === StatusTypes.SHIELD) {
                setToShield(false)
                setTimeout(() => {
                  setStatus((currentStatus) => {
                    if (currentStatus === StatusTypes.ANIMATING) {
                      return StatusTypes.MAIN
                    }
                    return currentStatus
                  })
                }, 3000)
                return StatusTypes.ANIMATING
              }
            }
            return StatusTypes.MAIN
          })
        }
      }
    }
    if (payload.update[1] !== null) {
      const hp = payload.update[1]!.hp
      const isShields = payload.update[1].shields
      setOpponent((prev1) => {
        setCharacters((prev3b) => {
          const prev3 = { ...prev3b }
          if (hp !== undefined) {
            prev1[0].current!.hp = hp
          }
          if (isShields !== undefined) {
            setOppShields(isShields)
          }
          if (payload.update[1]?.remaining !== undefined) {
            setOppRemaining(payload.update[1]?.remaining)
            prev1[0].current!.hp = 0
            if (!payload.update[0]?.remaining) {
              setStatus((prev4) => {
                if (prev4 === StatusTypes.FAINT) {
                  return prev4
                }
                return StatusTypes.WAITING
              })
            }
            prev3[1].anim = {
              type: 'faint',
              turn: payload.turn,
            }
          }
          return prev3
        })
        return prev1
      })
    }
    setSwap(payload.switch)
    setTime(payload.time)
  }

  // Send updates to charge moev decisions
  useEffect(() => {
    ws.send('$c' + chargeMult.toString())
  }, [chargeMult, status === StatusTypes.CHARGE])
  useEffect(() => {
    ws.send('$s' + (toShield ? 1 : 0).toString())
  }, [toShield])

  const onGameStatus = (payload: CheckPayload) => {
    if (payload.countdown === 4) {
      startGame()
    } else {
      setMessage(`Starting: ${payload.countdown}...`)
    }
  }

  const onFastMove = (data: Anim) => {
    setCharacters((prev) => {
      prev[1].anim = data
      return prev
    })
  }

  const onSwitch = (data: TeamMember) => {
    setOpponent((prev1) => {
      const newPrev1 = [...prev1]
      newPrev1[0] = data
      setCharacters((prev) => {
        prev[1].char = data
        prev[1].anim = {
          type: Actions.SWITCH,
        }
        return prev
      })
      return newPrev1
    })
  }

  const onMessage = (msg: MessageEvent) => {
    if (msg.data.startsWith('$end')) {
      const data = msg.data.slice(4)
      endGame(data)
    } else if (msg.data.startsWith('#')) {
      // Expected format: "#fa:Volt Switch"
      const data = msg.data.slice(1)
      const action: keyof typeof Actions = data.split(':', 1)[0]
      const payload = data.slice(action.length + 1)
      switch (action) {
        case Actions.FAST_ATTACK:
          onFastMove(JSON.parse(payload))
          break
        case Actions.SWITCH:
          onSwitch(JSON.parse(payload))
          break
      }
    } else {
      const data: Data = JSON.parse(msg.data)
      switch (data.type) {
        case CODE.game_check:
          onGameStatus(data.payload! as CheckPayload)
          break
        case CODE.game_start:
          initGame(data.payload! as InitPayload)
          startGame()
          break
        case CODE.turn:
          onTurn(data.payload! as ResolveTurnPayload)
          break
      }
    }
  }

  const toHome = () => {
    ws.close()
    router.push('/')
  }

  const fetchRoom = () => {
    Promise.all([
      axios.get(`${SERVER}api/room/data/${room}`).then((res) => {
        const currentRoom: Room = res.data
        const playerIndex = currentRoom.players.findIndex((x) => x?.id === id)
        const player = currentRoom.players[playerIndex]
        const oppon = currentRoom.players[playerIndex === 0 ? 1 : 0]
        if (player && oppon && player.current && oppon.current) {
          setActive(player.current.team)
          setOpponent(oppon.current.team)
          setCharacters((prevState) => {
            prevState[0].char = player.current?.team[0]
            prevState[1].char = oppon.current?.team[0]
            return prevState
          })
          setShields(player.current.shields)
          setRemaining(player.current.remaining)
          setOppShields(oppon.current.shields)
          setOppRemaining(oppon.current.remaining)
        } else {
          throw new Error()
        }
      }),
    ])
      .then(() => {
        ws.send(
          JSON.stringify({
            type: CODE.ready_game,
            payload: { room },
          })
        )
        ws.onmessage = onMessage
        setIsLoading(false)
      })
      .catch(toHome)
  }

  const onClick = () => {
    if (
      status === StatusTypes.MAIN &&
      wait <= -1 &&
      currentMove === '' &&
      bufferedMove === ''
    ) {
      const data = '#fa:'
      setCurrentMove(data)
      ws.send(data)
      setCharacters((prev) => {
        prev[0].anim = {
          move: moves[charPointer][0],
          type: Actions.FAST_ATTACK,
        }
        return prev
      })
      return true
    }
    return false
  }

  const onSwitchClick = (pos: number) => {
    if (
      status === StatusTypes.MAIN &&
      swap <= 0 &&
      wait <= -1 &&
      active[pos]?.current?.hp &&
      active[pos].current!.hp > 0
    ) {
      const data = '#sw:' + pos
      if (currentMove === '') {
        setCurrentMove(data)
        ws.send(data)
        setCharacters((prev) => {
          prev[0].anim = {
            type: Actions.SWITCH,
          }
          return prev
        })
        return true
      }
      if (bufferedMove === '') {
        setBufferedMove(data)
        ws.send(data)
        return true
      }
    }
    return false
  }

  const onChargeClick = (move: Move, index: number) => {
    if (
      status === StatusTypes.MAIN &&
      wait <= -1 &&
      active[charPointer].current?.energy &&
      active[charPointer].current!.energy! >= move.energy
    ) {
      const data = `#ca:${index}`
      if (currentMove === '' && bufferedMove === '') {
        setCurrentMove(data)
        setBufferedMove(data)
        ws.send(data)
        return true
      }
      if (
        !currentMove.startsWith('#ca') &&
        (bufferedMove === '' || bufferedMove.startsWith('#sw'))
      ) {
        setBufferedMove(data)
        ws.send(data)
        return true
      }
    }
    return false
  }

  const onFaintClick = (pos: number) => {
    if (
      (status === StatusTypes.FAINT || status === StatusTypes.WAITING) &&
      active[pos].current?.hp &&
      active[pos].current!.hp > 0
    ) {
      const data = '#sw:' + pos
      setCurrentMove(data)
      ws.send(data)
      setCharacters((prev) => {
        prev[0].anim = {
          type: Actions.SWITCH,
        }
        return prev
      })
      return true
    }
    return false
  }

  const onShield = () => {
    if (status === StatusTypes.SHIELD && shields > 0 && !toShield) {
      setToShield(true)
      setShields((prev) => prev - 1)
    }
  }

  const onQuit = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.preventDefault()
    e.stopPropagation()
    toHome()
  }

  const fastKeyClick = useKeyPress(fastKey)
  const charge1KeyClick = useKeyPress(charge1Key)
  const charge2KeyClick = useKeyPress(charge2Key)
  const switch1KeyClick = useKeyPress(switch1Key)
  const switch2KeyClick = useKeyPress(switch2Key)
  const shieldKeyClick = useKeyPress(shieldKey)

  useEffect(() => {
    if (!moves.length) {
      return
    }

    if (charge1KeyClick) {
      const move = moves[charPointer][1]
      if (!onChargeClick(move, 0)) {
        onClick()
      }
    } else if (charge2KeyClick) {
      const move = moves[charPointer][2]
      if (!onChargeClick(move, 1)) {
        onClick()
      }
    } else if (switch1KeyClick) {
      const pos = active.findIndex(
        (poke, index) => poke.current?.hp && index !== charPointer
      )
      if (!onSwitchClick(pos)) {
        onFaintClick(pos)
      }
    } else if (switch2KeyClick) {
      const pos =
        2 -
        [...active]
          .reverse()
          .findIndex(
            (poke, index) => poke.current?.hp && 2 - index !== charPointer
          )
      if (!onSwitchClick(pos)) {
        onFaintClick(pos)
      }
    } else if (shieldKeyClick) {
      onShield()
    }
  }, [
    charge1KeyClick,
    charge2KeyClick,
    switch1KeyClick,
    switch2KeyClick,
    shieldKeyClick,
  ])

  if (fastKeyClick) {
    onClick()
  }

  useEffect(() => {
    if (ws.readyState === ws.OPEN) {
      fetchRoom()
    } else {
      toHome()
    }
  }, [])

  if (isLoading) {
    return <Loader type="TailSpin" color="#68BFF5" height={80} width={80} />
  }

  const current = active[charPointer]
  const opp = opponent[0]

  return (
    <main className={style.root} style={{ height }}>
      <div className={style.content} onClick={onClick}>
        <section className={style.nav}>
          <button className="btn btn-negative" onClick={onQuit}>
            Exit
          </button>
        </section>
        <section className={style.statuses}>
          <Status subject={current} shields={shields} remaining={remaining} />
          <Status subject={opp} shields={oppShields} remaining={oppRemaining} />
        </section>
        <section className={style.info}>
          <div />
          <div className={style.timer}>
            <strong>{time + ' '}</strong>
            <Icon name="clock" size="medium" />
          </div>
        </section>

        <Field characters={characters} message={message} />
        <Switch
          team={active}
          pointer={charPointer}
          countdown={swap}
          onClick={onSwitchClick}
        />
        <Charged
          moves={
            moves[charPointer]
              ? moves[charPointer].filter((_, i) => i !== 0)
              : []
          }
          currentMove={currentMove}
          bufferedMove={bufferedMove}
          energy={current && current.current ? current.current.energy : 0}
          onClick={onChargeClick}
        />
        {showKeys && (
          <label className={style.keylabel}>
            Hold {getKeyDescription(fastKey).toUpperCase()}
          </label>
        )}

        <Popover
          closed={
            status === StatusTypes.MAIN || status === StatusTypes.ANIMATING
          }
          showMenu={
            status !== StatusTypes.WAITING && status !== StatusTypes.STARTING
          }
        >
          {status === StatusTypes.FAINT && (
            <Switch
              team={active}
              pointer={charPointer}
              countdown={wait}
              onClick={onFaintClick}
              modal={true}
            />
          )}
          {status === StatusTypes.CHARGE && (
            <Stepper onStep={setChargeMult} step={chargeMult} />
          )}
          {status === StatusTypes.SHIELD && (
            <Shield value={toShield} onShield={onShield} shields={shields} />
          )}
        </Popover>
      </div>
    </main>
  )
}

export default GamePage
